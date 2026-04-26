/**
 * test/unit/repositories/rotasRepository.unit.test.js
 *
 * Cobre o SQL do findActiveTodayForMotorista — rota visivel ao motorista
 * no /motorista/rota-hoje.
 *
 * Regra (ver doc da funcao):
 *   - status='pronta'  -> SO no dia exato (data_programada = CURDATE())
 *   - status='em_rota' -> tambem se data_programada < CURDATE() (rota
 *     iniciada e nao finalizada vira pra hoje, evita motorista ver
 *     "nao tem entrega" enquanto ainda tem paradas pendentes)
 */

"use strict";

const repo = require("../../../repositories/rotasRepository");

function makeMockConn() {
  return { query: jest.fn().mockResolvedValue([[], []]) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("rotasRepository — findActiveTodayForMotorista", () => {
  test("SQL filtra por motorista_id e usa CURDATE() pra rota pronta", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, conn);
    const [sql, params] = conn.query.mock.calls[0];
    expect(params).toEqual([6]);
    expect(sql).toMatch(/WHERE motorista_id = \?/);
    expect(sql).toMatch(/status\s*=\s*'pronta'\s+AND\s+data_programada\s*=\s*CURDATE\(\)/);
  });

  test("SQL inclui rotas em_rota com data_programada <= CURDATE() (rotas presas)", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, conn);
    const [sql] = conn.query.mock.calls[0];
    expect(sql).toMatch(
      /status\s*=\s*'em_rota'\s+AND\s+data_programada\s*<=\s*CURDATE\(\)/,
    );
  });

  test("ORDER BY status DESC garante em_rota antes de pronta no desempate", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, conn);
    const [sql] = conn.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY status DESC, id DESC/);
    expect(sql).toMatch(/LIMIT 1/);
  });

  test("retorna null quando nao ha rota", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[], []]);
    const r = await repo.findActiveTodayForMotorista(6, conn);
    expect(r).toBeNull();
  });

  test("retorna a primeira row quando ha rota", async () => {
    const conn = makeMockConn();
    const rota = { id: 8, motorista_id: 6, status: "em_rota", data_programada: "2026-04-25" };
    conn.query.mockResolvedValueOnce([[rota], []]);
    const r = await repo.findActiveTodayForMotorista(6, conn);
    expect(r).toEqual(rota);
  });
});
