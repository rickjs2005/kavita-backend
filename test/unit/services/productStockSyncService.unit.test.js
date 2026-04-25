/**
 * test/unit/services/productStockSyncService.unit.test.js
 *
 * Cobre as 4 regras de A1+A2:
 *   1. Estoque zerou → desativa, marca deactivated_by='system'
 *   2. Estoque voltou e foi 'system' → reativa, deactivated_by=NULL
 *   3. Estoque voltou mas foi 'manual' → mantém inativo
 *   4. Estoque normal sem mudança de estado → no-op
 *
 * + edge cases:
 *   - quantity <= 0 (negativo) com produto já inativo → no-op
 *   - sem productId → no-op
 *   - produto não existe → no-op
 */

describe("services/productStockSyncService.syncActiveByStock", () => {
  const { syncActiveByStock } = require("../../../services/productStockSyncService");

  function mockConn(productRow) {
    const queries = [];
    return {
      queries,
      query: jest.fn(async (sql, params) => {
        queries.push({ sql: String(sql), params });
        const s = String(sql);
        // SELECT pega o produto
        if (s.includes("SELECT") && s.includes("FROM products")) {
          return [[productRow], []];
        }
        // UPDATE retorna affected = 1
        if (s.includes("UPDATE products")) {
          return [{ affectedRows: 1 }, undefined];
        }
        return [[], []];
      }),
    };
  }

  test("regra 1 — estoque zerou e estava ativo: desativa por system", async () => {
    const conn = mockConn({
      id: 5,
      quantity: 0,
      is_active: 1,
      deactivated_by: null,
    });

    const out = await syncActiveByStock(conn, 5);

    expect(out).toBe("deactivated");
    const updates = conn.queries.filter((q) => q.sql.includes("UPDATE products"));
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("is_active = 0");
    expect(updates[0].sql).toContain("deactivated_by = 'system'");
  });

  test("regra 1 — quantity negativo (race) ainda desativa", async () => {
    const conn = mockConn({
      id: 5,
      quantity: -1,
      is_active: 1,
      deactivated_by: null,
    });

    const out = await syncActiveByStock(conn, 5);

    expect(out).toBe("deactivated");
  });

  test("regra 2 — voltou estoque e foi 'system': reativa", async () => {
    const conn = mockConn({
      id: 7,
      quantity: 3,
      is_active: 0,
      deactivated_by: "system",
    });

    const out = await syncActiveByStock(conn, 7);

    expect(out).toBe("reactivated");
    const updates = conn.queries.filter((q) => q.sql.includes("UPDATE products"));
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("is_active = 1");
    expect(updates[0].sql).toContain("deactivated_by = NULL");
  });

  test("regra 3 — voltou estoque mas foi 'manual': MANTÉM inativo", async () => {
    const conn = mockConn({
      id: 9,
      quantity: 10,
      is_active: 0,
      deactivated_by: "manual",
    });

    const out = await syncActiveByStock(conn, 9);

    expect(out).toBe("noop");
    const updates = conn.queries.filter((q) => q.sql.includes("UPDATE products"));
    expect(updates).toHaveLength(0);
  });

  test("regra 4 — produto ativo com estoque normal: no-op", async () => {
    const conn = mockConn({
      id: 11,
      quantity: 50,
      is_active: 1,
      deactivated_by: null,
    });

    const out = await syncActiveByStock(conn, 11);

    expect(out).toBe("noop");
    const updates = conn.queries.filter((q) => q.sql.includes("UPDATE products"));
    expect(updates).toHaveLength(0);
  });

  test("edge — produto inativo com qty=0 (estado consistente): no-op", async () => {
    const conn = mockConn({
      id: 12,
      quantity: 0,
      is_active: 0,
      deactivated_by: "system",
    });

    const out = await syncActiveByStock(conn, 12);

    expect(out).toBe("noop");
    const updates = conn.queries.filter((q) => q.sql.includes("UPDATE products"));
    expect(updates).toHaveLength(0);
  });

  test("edge — produto não encontrado: no-op", async () => {
    const conn = mockConn(undefined);
    const out = await syncActiveByStock(conn, 99);
    expect(out).toBe("noop");
  });

  test("edge — sem productId: no-op sem queries", async () => {
    const conn = mockConn({});
    const out = await syncActiveByStock(conn, null);
    expect(out).toBe("noop");
    expect(conn.query).not.toHaveBeenCalled();
  });

  test("edge — sem conn: no-op", async () => {
    const out = await syncActiveByStock(null, 5);
    expect(out).toBe("noop");
  });
});

describe("services/productStockSyncService.syncActiveByStockBatch", () => {
  const {
    syncActiveByStockBatch,
  } = require("../../../services/productStockSyncService");

  test("itera sobre cada productId em ordem", async () => {
    const calls = [];
    const conn = {
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("SELECT")) {
          calls.push(params[0]);
          // Sempre retorna produto ativo com estoque normal: no-op
          return [
            [{ id: params[0], quantity: 10, is_active: 1, deactivated_by: null }],
            [],
          ];
        }
        return [[], []];
      }),
    };

    await syncActiveByStockBatch(conn, [1, 2, 3]);

    expect(calls).toEqual([1, 2, 3]);
  });

  test("array vazio: no-op", async () => {
    const conn = { query: jest.fn() };
    await syncActiveByStockBatch(conn, []);
    expect(conn.query).not.toHaveBeenCalled();
  });
});
