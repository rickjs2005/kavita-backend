// test/unit/repositories/contratoRepositoryListAdmin.unit.test.js
//
// Cobre o SQL paginado/filtrado de contratoRepository.listForAdmin
// (Fase 10.10). Mocka o pool para inspecionar WHERE/params/ORDER.
"use strict";

function loadWithPool(poolMock) {
  jest.resetModules();
  jest.doMock(require.resolve("../../../config/pool"), () => poolMock);
  // eslint-disable-next-line global-require
  return require("../../../repositories/contratoRepository");
}

function makePoolMock(countTotal, rows) {
  const query = jest
    .fn()
    .mockResolvedValueOnce([[{ total: countTotal }]])
    .mockResolvedValueOnce([rows]);
  return { query };
}

describe("contratoRepository.listForAdmin", () => {
  it("sem filtros: retorna paginação default (page=1, limit=20)", async () => {
    const pool = makePoolMock(0, []);
    const repo = loadWithPool(pool);
    const result = await repo.listForAdmin({});
    expect(result.items).toEqual([]);
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      total_pages: 1,
    });
    // Sem WHERE quando não há filtros
    const [countSql] = pool.query.mock.calls[0];
    expect(countSql).not.toMatch(/WHERE/);
    // SELECT principal carrega ORDER + LIMIT/OFFSET
    const [selectSql, selectParams] = pool.query.mock.calls[1];
    expect(selectSql).toMatch(/ORDER BY c\.created_at DESC, c\.id DESC/);
    expect(selectParams[selectParams.length - 2]).toBe(20); // limit
    expect(selectParams[selectParams.length - 1]).toBe(0); // offset
  });

  it("filtra por status, tipo, corretora_id e lead_id (compõe AND)", async () => {
    const pool = makePoolMock(2, [
      { id: 1, status: "signed" },
      { id: 2, status: "signed" },
    ]);
    const repo = loadWithPool(pool);
    const result = await repo.listForAdmin({
      status: "signed",
      tipo: "disponivel",
      corretora_id: 7,
      lead_id: 99,
      page: 1,
      limit: 10,
    });
    expect(result.meta.total).toBe(2);
    expect(result.meta.limit).toBe(10);
    const [countSql, countParams] = pool.query.mock.calls[0];
    expect(countSql).toMatch(
      /WHERE c\.status = \? AND c\.tipo = \? AND c\.corretora_id = \? AND c\.lead_id = \?/,
    );
    expect(countParams).toEqual(["signed", "disponivel", 7, 99]);
  });

  it("q numérico: busca por id E numero_externo E lead.nome (OR)", async () => {
    const pool = makePoolMock(1, [{ id: 42, status: "draft" }]);
    const repo = loadWithPool(pool);
    await repo.listForAdmin({ q: "42" });
    const [countSql, countParams] = pool.query.mock.calls[0];
    expect(countSql).toMatch(/\(c\.id = \? OR l\.nome LIKE \? OR /);
    expect(countParams[0]).toBe(42);
    expect(countParams[1]).toBe("%42%");
  });

  it("q textual: busca apenas em numero_externo e lead.nome (sem c.id = ?)", async () => {
    const pool = makePoolMock(0, []);
    const repo = loadWithPool(pool);
    await repo.listForAdmin({ q: "João" });
    const [countSql, countParams] = pool.query.mock.calls[0];
    expect(countSql).not.toMatch(/c\.id = \?/);
    expect(countSql).toMatch(/l\.nome LIKE \?/);
    expect(countParams).toEqual(["%João%", "%João%"]);
  });

  it("date_from/date_to: aplica boundaries 00:00:00 / 23:59:59", async () => {
    const pool = makePoolMock(0, []);
    const repo = loadWithPool(pool);
    await repo.listForAdmin({
      date_from: "2026-05-01",
      date_to: "2026-05-31",
    });
    const [countSql, countParams] = pool.query.mock.calls[0];
    expect(countSql).toMatch(/c\.created_at >= \? AND c\.created_at <= \?/);
    expect(countParams).toEqual([
      "2026-05-01 00:00:00",
      "2026-05-31 23:59:59",
    ]);
  });

  it("paginação: offset = (page-1)*limit; total_pages calcula ceil", async () => {
    const pool = makePoolMock(45, []);
    const repo = loadWithPool(pool);
    const result = await repo.listForAdmin({ page: 3, limit: 10 });
    expect(result.meta).toEqual({
      total: 45,
      page: 3,
      limit: 10,
      total_pages: 5, // ceil(45/10)
    });
    const [, selectParams] = pool.query.mock.calls[1];
    expect(selectParams[selectParams.length - 2]).toBe(10);
    expect(selectParams[selectParams.length - 1]).toBe(20); // (3-1)*10
  });

  it("limit acima de 100 é clampado para 100; page < 1 vira 1", async () => {
    const pool = makePoolMock(0, []);
    const repo = loadWithPool(pool);
    const result = await repo.listForAdmin({ page: 0, limit: 9999 });
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(100);
  });

  it("SELECT principal traz join com corretora e lead (nomes legíveis)", async () => {
    const pool = makePoolMock(0, []);
    const repo = loadWithPool(pool);
    await repo.listForAdmin({});
    const [selectSql] = pool.query.mock.calls[1];
    expect(selectSql).toMatch(/JOIN corretoras co ON co\.id = c\.corretora_id/);
    expect(selectSql).toMatch(
      /JOIN corretora_leads l ON l\.id = c\.lead_id/,
    );
    expect(selectSql).toMatch(/co\.name AS corretora_name/);
    expect(selectSql).toMatch(/l\.nome AS lead_nome/);
    // data_fields completo NÃO vai no SELECT (apenas o
    // __numero_externo via JSON_EXTRACT).
    expect(selectSql).not.toMatch(/c\.data_fields\b(?!,)/);
    expect(selectSql).toMatch(/__numero_externo/);
  });
});
