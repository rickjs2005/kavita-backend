/**
 * test/unit/services/rotaStaleScanService.unit.test.js
 *
 * Fase 4 — alerta de rota parada. Cobre:
 *   - threshold default (6h) + override por env + override por opts
 *   - SQL passa o parametro correto pra TIMESTAMPDIFF
 *   - retorno tem shape { items, threshold_hours }
 *   - rotas vazias -> items: []
 */

"use strict";

describe("services/rotaStaleScanService", () => {
  const originalEnv = process.env;

  function loadWithMocks({ envOverrides = {}, queryStub } = {}) {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "test", ...envOverrides };
    const query = queryStub ?? jest.fn().mockResolvedValue([[], []]);
    jest.doMock(require.resolve("../../../config/pool"), () => ({ query }));
    const svc = require("../../../services/rotaStaleScanService");
    return { svc, query };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  test("default threshold 6h", async () => {
    const { svc, query } = loadWithMocks();
    await svc.list();
    expect(query.mock.calls[0][1]).toEqual([6]);
  });

  test("env override ROTA_STALE_HOURS", async () => {
    const { svc, query } = loadWithMocks({
      envOverrides: { ROTA_STALE_HOURS: "12" },
    });
    await svc.list();
    expect(query.mock.calls[0][1]).toEqual([12]);
  });

  test("opts.olderThanHours sobrescreve env", async () => {
    const { svc, query } = loadWithMocks({
      envOverrides: { ROTA_STALE_HOURS: "12" },
    });
    await svc.list({ olderThanHours: 24 });
    expect(query.mock.calls[0][1]).toEqual([24]);
  });

  test("retorna items + threshold_hours", async () => {
    const fakeRow = {
      id: 7,
      data_programada: "2026-04-25",
      motorista_id: 3,
      motorista_nome: "Joao",
      motorista_telefone: "5533999999999",
      iniciada_em: "2026-04-25T08:00:00.000Z",
      total_paradas: 5,
      total_entregues: 0,
      ultima_atualizacao: "2026-04-25T08:00:00.000Z",
      horas_paradas: 7,
    };
    const { svc } = loadWithMocks({
      queryStub: jest.fn().mockResolvedValue([[fakeRow], []]),
    });
    const r = await svc.list({ olderThanHours: 6 });
    expect(r.threshold_hours).toBe(6);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].id).toBe(7);
    expect(r.items[0].horas_paradas).toBe(7);
  });

  test("vazio: items: [], threshold preserva", async () => {
    const { svc } = loadWithMocks();
    const r = await svc.list();
    expect(r.items).toEqual([]);
    expect(r.threshold_hours).toBe(6);
  });

  test("SQL filtra status='em_rota' AND updated_at < NOW() - INTERVAL", async () => {
    const { svc, query } = loadWithMocks();
    await svc.list();
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/status\s*=\s*'em_rota'/);
    expect(sql).toMatch(/updated_at\s*<\s*\(?\s*NOW\(\)\s*-\s*INTERVAL/i);
  });

  test("constants exposed", () => {
    const { svc } = loadWithMocks();
    expect(svc.DEFAULT_THRESHOLD_HOURS).toBe(6);
  });
});
