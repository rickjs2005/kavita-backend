/**
 * test/unit/jobs/abandonedCartsScanJob.unit.test.js
 *
 * Unit tests para o job automatico de scan de carrinhos abandonados.
 * Nao cria timer real — usa register({ force: true }) + chamadas diretas a tick().
 */

"use strict";

describe("abandonedCartsScanJob", () => {
  const originalEnv = process.env;

  function loadJobWithMocks({ envOverrides = {}, scanMock } = {}) {
    jest.resetModules();

    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ...envOverrides,
    };

    jest.doMock(require.resolve("../../../services/cartsAdminService"), () => ({
      scanAbandonedCarts:
        scanMock ??
        jest.fn().mockResolvedValue({
          candidates: 0,
          inserted: 0,
          skippedEmpty: 0,
          skippedError: 0,
          minHours: 24,
        }),
    }));

    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const job = require("../../../jobs/abandonedCartsScanJob");
    const cartsSvc = require("../../../services/cartsAdminService");
    const logger = require("../../../lib/logger");

    return { job, cartsSvc, logger };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  test("register: nao inicia timer quando ABANDONED_CART_SCAN_ENABLED=false", async () => {
    const { job, logger } = loadJobWithMocks({
      envOverrides: { ABANDONED_CART_SCAN_ENABLED: "false" },
    });

    await job.register();

    const state = job.getState();
    expect(state.enabled).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "abandoned-carts-scan" }),
      expect.stringContaining("disabled"),
    );
  });

  test("register: em NODE_ENV=test sem force nao inicia timer", async () => {
    const { job } = loadJobWithMocks({
      envOverrides: { ABANDONED_CART_SCAN_ENABLED: "true" },
    });

    await job.register();

    const state = job.getState();
    expect(state.enabled).toBe(true);
    // nao agenda setInterval — nao tem startedAt
    expect(state.startedAt).toBeNull();

    job.stop();
  });

  test("register com force=true agenda timer e seta startedAt", async () => {
    jest.useFakeTimers();
    const { job } = loadJobWithMocks({
      envOverrides: {
        ABANDONED_CART_SCAN_ENABLED: "true",
        ABANDONED_CART_SCAN_INTERVAL_MS: "60000",
      },
    });

    await job.register({ force: true });

    const state = job.getState();
    expect(state.enabled).toBe(true);
    expect(state.startedAt).not.toBeNull();
    expect(state.intervalMs).toBe(60000);

    job.stop();
  });

  test("tick: chama scanAbandonedCarts com minHours e grava report", async () => {
    const scanMock = jest.fn().mockResolvedValue({
      candidates: 3,
      inserted: 2,
      skippedEmpty: 1,
      skippedError: 0,
      minHours: 24,
    });
    const { job, cartsSvc } = loadJobWithMocks({
      envOverrides: { ABANDONED_CART_MIN_HOURS: "24" },
      scanMock,
    });

    await job.tick();

    expect(cartsSvc.scanAbandonedCarts).toHaveBeenCalledWith(24);
    const state = job.getState();
    expect(state.lastStatus).toBe("success");
    expect(state.lastReport).toMatchObject({
      candidates: 3,
      inserted: 2,
      skippedEmpty: 1,
    });
    expect(state.lastReport.durationMs).toEqual(expect.any(Number));
    expect(state.totalRuns).toBe(1);
  });

  test("tick: respeita ABANDONED_CART_MIN_HOURS custom", async () => {
    const scanMock = jest.fn().mockResolvedValue({
      candidates: 0,
      inserted: 0,
      skippedEmpty: 0,
      skippedError: 0,
      minHours: 12,
    });
    const { job, cartsSvc } = loadJobWithMocks({
      envOverrides: { ABANDONED_CART_MIN_HOURS: "12" },
      scanMock,
    });

    await job.tick();

    expect(cartsSvc.scanAbandonedCarts).toHaveBeenCalledWith(12);
  });

  test("tick: captura erro do service e nao lanca", async () => {
    const scanMock = jest.fn().mockRejectedValue(new Error("db down"));
    const { job, logger } = loadJobWithMocks({ scanMock });

    await expect(job.tick()).resolves.toBeUndefined();

    const state = job.getState();
    expect(state.lastStatus).toBe("error");
    expect(state.lastError).toBe("db down");
    expect(logger.error).toHaveBeenCalled();
  });

  test("tick concorrente: segunda chamada e pulada enquanto primeira roda", async () => {
    let release;
    const inFlight = new Promise((resolve) => {
      release = resolve;
    });
    const scanMock = jest.fn().mockImplementation(() =>
      inFlight.then(() => ({
        candidates: 0,
        inserted: 0,
        skippedEmpty: 0,
        skippedError: 0,
        minHours: 24,
      })),
    );
    const { job, cartsSvc, logger } = loadJobWithMocks({ scanMock });

    const first = job.tick();
    // dispara segunda tick com a primeira ainda pendurada
    const second = job.tick();

    release();
    await Promise.all([first, second]);

    expect(cartsSvc.scanAbandonedCarts).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "abandoned-carts-scan" }),
      expect.stringContaining("skipping"),
    );
  });

  test("register idempotente: segunda chamada e ignorada", async () => {
    const { job, logger } = loadJobWithMocks({
      envOverrides: {
        ABANDONED_CART_SCAN_ENABLED: "true",
        ABANDONED_CART_SCAN_INTERVAL_MS: "60000",
      },
    });

    await job.register({ force: true });
    await job.register({ force: true });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "abandoned-carts-scan" }),
      expect.stringContaining("already registered"),
    );

    job.stop();
  });

  test("intervalo abaixo do minimo cai para default", async () => {
    const { job } = loadJobWithMocks({
      envOverrides: {
        ABANDONED_CART_SCAN_ENABLED: "true",
        ABANDONED_CART_SCAN_INTERVAL_MS: "1000", // abaixo do MIN_INTERVAL_MS=60000
      },
    });

    await job.register({ force: true });

    const state = job.getState();
    // deve cair para 15 * 60 * 1000 = 900000
    expect(state.intervalMs).toBe(15 * 60 * 1000);

    job.stop();
  });
});
