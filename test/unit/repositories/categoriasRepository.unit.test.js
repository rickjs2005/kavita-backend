/**
 * test/unit/repositories/categoriasRepository.unit.test.js
 *
 * Estratégia: mock do pool para verificar SQL e parâmetros exatos.
 * Não há lógica de negócio no repository — cobrimos apenas:
 *   - SQL correto (tabela, colunas, operação)
 *   - Parâmetros na ordem correta
 *   - Mapeamento de retorno (rows[0] ?? null, affectedRows)
 */

"use strict";

jest.mock("../../../config/pool", () => ({
  query: jest.fn(),
}));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/categoriasRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// listCategories
// ---------------------------------------------------------------------------

describe("categoriasRepository — listCategories", () => {
  test("retorna todas as linhas da query", async () => {
    const rows = [
      { id: 1, name: "Ração", slug: "racao", is_active: 1, sort_order: 1 },
      { id: 2, name: "Brinquedos", slug: "brinquedos", is_active: 1, sort_order: 2 },
    ];
    mockQuery([rows]);

    const result = await repo.listCategories();

    expect(result).toEqual(rows);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("SELECT id, name, slug, is_active, sort_order");
    expect(sql).toContain("FROM categories");
    expect(sql).toContain("ORDER BY sort_order ASC, name ASC");
  });

  test("retorna array vazio quando não há categorias", async () => {
    mockQuery([[]]);
    const result = await repo.listCategories();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findCategoryById
// ---------------------------------------------------------------------------

describe("categoriasRepository — findCategoryById", () => {
  test("retorna a linha quando encontrada", async () => {
    const row = { id: 5, name: "Ração", slug: "racao", sort_order: 1, is_active: 1 };
    mockQuery([[row]]);

    const result = await repo.findCategoryById(5);

    expect(result).toEqual(row);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE id = ?");
    expect(params).toEqual([5]);
  });

  test("retorna null quando não encontrada", async () => {
    mockQuery([[]]);
    const result = await repo.findCategoryById(999);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------

describe("categoriasRepository — createCategory", () => {
  test("passa name, slug e sort_order na ordem correta e retorna insertId", async () => {
    mockQuery([{ insertId: 42 }]);

    const id = await repo.createCategory({ name: "Higiene", slug: "higiene", sort_order: 3 });

    expect(id).toBe(42);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO categories");
    expect(sql).toContain("is_active");
    expect(params).toEqual(["Higiene", "higiene", 3]);
  });

  test("is_active não é parâmetro bind — está hardcoded como 1 no SQL", async () => {
    mockQuery([{ insertId: 1 }]);
    await repo.createCategory({ name: "X", slug: "x", sort_order: 0 });
    const [sql] = pool.query.mock.calls[0];
    // is_active = 1 está inline; se fosse parâmetro a query teria 4 ?
    expect((sql.match(/\?/g) || []).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// updateCategory
// ---------------------------------------------------------------------------

describe("categoriasRepository — updateCategory", () => {
  test("atualiza name, slug e sort_order; id é o último parâmetro", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.updateCategory(7, { name: "Novo", slug: "novo", sort_order: 2 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE categories SET name = ?, slug = ?, sort_order = ?");
    expect(sql).toContain("WHERE id = ?");
    expect(params).toEqual(["Novo", "novo", 2, 7]);
  });

  test("não atualiza is_active (separação de responsabilidade)", async () => {
    mockQuery([{ affectedRows: 1 }]);
    await repo.updateCategory(1, { name: "A", slug: "a", sort_order: 0 });
    const [sql] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).not.toContain("is_active");
  });
});

// ---------------------------------------------------------------------------
// updateCategoryStatus
// ---------------------------------------------------------------------------

describe("categoriasRepository — updateCategoryStatus", () => {
  test("is_active=true → passa 1 como parâmetro", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const affected = await repo.updateCategoryStatus(3, true);

    expect(affected).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SET is_active = ?");
    expect(params).toEqual([1, 3]);
  });

  test("is_active=false → passa 0 como parâmetro", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.updateCategoryStatus(3, false);

    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe(0);
  });

  test("retorna 0 quando categoria não existe", async () => {
    mockQuery([{ affectedRows: 0 }]);
    const affected = await repo.updateCategoryStatus(999, true);
    expect(affected).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// deleteCategory
// ---------------------------------------------------------------------------

describe("categoriasRepository — deleteCategory", () => {
  test("executa DELETE com o id correto e retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const affected = await repo.deleteCategory(9);

    expect(affected).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM categories");
    expect(params).toEqual([9]);
  });

  test("retorna 0 quando categoria não existe", async () => {
    mockQuery([{ affectedRows: 0 }]);
    const affected = await repo.deleteCategory(999);
    expect(affected).toBe(0);
  });
});
