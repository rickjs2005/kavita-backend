/**
 * test/unit/services/rotasOrfasScanService.unit.test.js
 *
 * Cobre o Bug 3 — auto-cancelamento de rotas orfas (em_rota >24h sem update).
 *   - SQL filtra status='em_rota' e usa INTERVAL N HOUR
 *   - Threshold via opts > env > default
 *   - runOnce cancela cada candidata via rotasService.alterarStatus
 *   - Falha em UMA rota nao trava as demais
 *   - report.detected/canceled/failed/threshold_hours/ids_canceled
 *   - list_failed retorna report zerado sem lancar
 */

"use strict";

describe("services/rotasOrfasScanService", () => {
  function loadWithMocks({
    poolQueryStub = jest.fn().mockResolvedValue([[], []]),
    alterarStatusStub = jest.fn().mockResolvedValue({ id: 1, status: "cancelada" }),
  } = {}) {
    jest.resetModules();

    jest.doMock(require.resolve("../../../config/pool"), () => ({
      query: poolQueryStub,
    }));
    jest.doMock(require.resolve("../../../services/rotasService"), () => ({
      alterarStatus: alterarStatusStub,
    }));
    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    return require("../../../services/rotasOrfasScanService");
  }

  afterEach(() => {
    delete process.env.ROTAS_ORFAS_HORAS;
  });

  test("list: SQL filtra status='em_rota' e usa INTERVAL ? HOUR", async () => {
    const poolQueryStub = jest.fn().mockResolvedValue([[], []]);
    const svc = loadWithMocks({ poolQueryStub });
    await svc.list();
    const [sql, params] = poolQueryStub.mock.calls[0];
    expect(sql).toMatch(/status\s*=\s*'em_rota'/);
    expect(sql).toMatch(/updated_at\s*<\s*\(NOW\(\)\s*-\s*INTERVAL\s*\?\s*HOUR\)/);
    expect(params).toEqual([24]); // default
  });

  test("list: threshold via opts.hoursThreshold tem prioridade sobre env", async () => {
    process.env.ROTAS_ORFAS_HORAS = "12";
    const poolQueryStub = jest.fn().mockResolvedValue([[], []]);
    const svc = loadWithMocks({ poolQueryStub });
    await svc.list({ hoursThreshold: 6 });
    expect(poolQueryStub.mock.calls[0][1]).toEqual([6]);
  });

  test("list: threshold via env quando opts ausente", async () => {
    process.env.ROTAS_ORFAS_HORAS = "8";
    const poolQueryStub = jest.fn().mockResolvedValue([[], []]);
    const svc = loadWithMocks({ poolQueryStub });
    await svc.list();
    expect(poolQueryStub.mock.calls[0][1]).toEqual([8]);
  });

  test("runOnce: zero candidatas retorna report.detected=0 e nao chama alterarStatus", async () => {
    const alterarStatusStub = jest.fn();
    const svc = loadWithMocks({
      poolQueryStub: jest.fn().mockResolvedValue([[], []]),
      alterarStatusStub,
    });
    const report = await svc.runOnce();
    expect(report.detected).toBe(0);
    expect(report.canceled).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.threshold_hours).toBe(24);
    expect(report.ids_canceled).toEqual([]);
    expect(alterarStatusStub).not.toHaveBeenCalled();
  });

  test("runOnce: cancela cada candidata via rotasService.alterarStatus", async () => {
    const candidatas = [
      { id: 7, motorista_id: 5, updated_at: new Date(), horas_paradas: 30 },
      { id: 8, motorista_id: 6, updated_at: new Date(), horas_paradas: 50 },
    ];
    const alterarStatusStub = jest.fn().mockResolvedValue({ status: "cancelada" });
    const svc = loadWithMocks({
      poolQueryStub: jest.fn().mockResolvedValue([candidatas, []]),
      alterarStatusStub,
    });
    const report = await svc.runOnce();
    expect(report.detected).toBe(2);
    expect(report.canceled).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.ids_canceled).toEqual([7, 8]);
    expect(alterarStatusStub).toHaveBeenCalledTimes(2);
    expect(alterarStatusStub).toHaveBeenNthCalledWith(1, 7, "cancelada");
    expect(alterarStatusStub).toHaveBeenNthCalledWith(2, 8, "cancelada");
  });

  test("runOnce: falha em uma rota nao trava as demais (failed++)", async () => {
    const candidatas = [
      { id: 7, motorista_id: 5, updated_at: new Date(), horas_paradas: 30 },
      { id: 8, motorista_id: 6, updated_at: new Date(), horas_paradas: 50 },
      { id: 9, motorista_id: 7, updated_at: new Date(), horas_paradas: 70 },
    ];
    const alterarStatusStub = jest
      .fn()
      .mockResolvedValueOnce({ status: "cancelada" })
      .mockRejectedValueOnce(new Error("FSM bloqueou"))
      .mockResolvedValueOnce({ status: "cancelada" });
    const svc = loadWithMocks({
      poolQueryStub: jest.fn().mockResolvedValue([candidatas, []]),
      alterarStatusStub,
    });
    const report = await svc.runOnce();
    expect(report.detected).toBe(3);
    expect(report.canceled).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.ids_canceled).toEqual([7, 9]);
  });

  test("runOnce: list_failed retorna report zerado sem lancar", async () => {
    const poolQueryStub = jest.fn().mockRejectedValue(new Error("DB down"));
    const svc = loadWithMocks({ poolQueryStub });
    const report = await svc.runOnce();
    expect(report.detected).toBe(0);
    expect(report.canceled).toBe(0);
    expect(report.failed).toBe(0);
  });
});
