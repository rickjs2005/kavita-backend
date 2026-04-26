/**
 * test/unit/repositories/rotasRepository.unit.test.js
 *
 * Cobre o SQL do findActiveTodayForMotorista — rota visivel ao motorista
 * no /motorista/rota-hoje.
 *
 * Regra (ver doc da funcao):
 *   - status='pronta'  -> SO no dia exato (data_programada = today)
 *   - status='em_rota' -> tambem se data_programada < today (rota
 *     iniciada e nao finalizada vira pra hoje)
 *
 * `today` (YYYY-MM-DD) e' computado em BRT pelo service caller
 * (motoristaService._todayBR). NAO usar CURDATE() do MySQL porque o pool
 * em prod pode estar em UTC.
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
  test("exige opts.today no formato YYYY-MM-DD", async () => {
    const conn = makeMockConn();
    await expect(
      repo.findActiveTodayForMotorista(6, { conn }),
    ).rejects.toThrow(/today.*YYYY-MM-DD/);
    await expect(
      repo.findActiveTodayForMotorista(6, { today: "2026/04/26", conn }),
    ).rejects.toThrow(/today.*YYYY-MM-DD/);
    await expect(
      repo.findActiveTodayForMotorista(6, { today: "abc", conn }),
    ).rejects.toThrow(/today.*YYYY-MM-DD/);
  });

  test("SQL filtra por motorista_id e usa today (parametrizado) pra rota pronta", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, { today: "2026-04-26", conn });
    const [sql, params] = conn.query.mock.calls[0];
    expect(params).toEqual([6, "2026-04-26", "2026-04-26"]);
    expect(sql).toMatch(/WHERE motorista_id = \?/);
    expect(sql).toMatch(/status\s*=\s*'pronta'\s+AND\s+data_programada\s*=\s*\?/);
    // CRITICO: zero CURDATE no SQL — TZ do banco nao influencia mais
    expect(sql).not.toMatch(/CURDATE/);
  });

  test("SQL inclui rotas em_rota com data_programada <= today (rotas presas)", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, { today: "2026-04-26", conn });
    const [sql] = conn.query.mock.calls[0];
    expect(sql).toMatch(
      /status\s*=\s*'em_rota'\s+AND\s+data_programada\s*<=\s*\?/,
    );
  });

  test("ORDER BY status DESC garante em_rota antes de pronta no desempate", async () => {
    const conn = makeMockConn();
    await repo.findActiveTodayForMotorista(6, { today: "2026-04-26", conn });
    const [sql] = conn.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY status DESC, id DESC/);
    expect(sql).toMatch(/LIMIT 1/);
  });

  test("retorna null quando nao ha rota", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[], []]);
    const r = await repo.findActiveTodayForMotorista(6, { today: "2026-04-26", conn });
    expect(r).toBeNull();
  });

  test("retorna a primeira row quando ha rota", async () => {
    const conn = makeMockConn();
    const rota = { id: 8, motorista_id: 6, status: "em_rota", data_programada: "2026-04-25" };
    conn.query.mockResolvedValueOnce([[rota], []]);
    const r = await repo.findActiveTodayForMotorista(6, { today: "2026-04-26", conn });
    expect(r).toEqual(rota);
  });
});
