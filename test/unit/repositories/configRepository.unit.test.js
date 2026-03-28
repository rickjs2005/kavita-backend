/**
 * test/unit/repositories/configRepository.unit.test.js
 *
 * O que está sendo testado:
 *   - ensureSettings: retorna id existente se já há row, insere default se vazia
 *   - findSettingsById: retorna row ou null
 *   - updateSettingsById: passa data como objeto (sintaxe SET ?)
 *   - findAllCategories: retorna array de categorias ordenadas por nome
 *   - insertCategory: nome é trimado, slug aceita null, ativo é convertido para 0/1
 *   - updateCategoryById: 4 params na ordem correta, retorna affectedRows
 */

"use strict";

jest.mock("../../../config/pool");

const pool = require("../../../config/pool");
const repo = require("../../../repositories/configRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ensureSettings — dois comportamentos críticos
// ---------------------------------------------------------------------------

describe("configRepository — ensureSettings", () => {
  test("retorna id existente sem inserir quando shop_settings já tem row", async () => {
    mockQuery([[{ id: 1 }]]); // SELECT encontra row existente

    const result = await repo.ensureSettings();

    expect(result).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(1); // apenas SELECT, sem INSERT
  });

  test("insere row default e retorna insertId quando tabela vazia", async () => {
    mockQuery([[]]); // SELECT retorna vazio
    mockQuery([{ insertId: 1 }]); // INSERT

    const result = await repo.ensureSettings();

    expect(result).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [insertSql] = pool.query.mock.calls[1];
    expect(insertSql.toLowerCase()).toContain("insert into shop_settings");
  });
});

// ---------------------------------------------------------------------------
// findSettingsById
// ---------------------------------------------------------------------------

describe("configRepository — findSettingsById", () => {
  test("retorna row de configurações quando id existe", async () => {
    const row = { id: 1, store_name: "Kavita" };
    mockQuery([[row]]);

    const result = await repo.findSettingsById(1);

    expect(result).toEqual(row);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([1]);
  });

  test("retorna null quando id não existe", async () => {
    mockQuery([[]]);
    const result = await repo.findSettingsById(999);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateSettingsById
// ---------------------------------------------------------------------------

describe("configRepository — updateSettingsById", () => {
  test("passa data como objeto e id nessa ordem (sintaxe SET ?)", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const data = { store_name: "Kavita Agro", footer_tagline: "Tecnologia no campo" };

    await repo.updateSettingsById(1, data);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update shop_settings set ?");
    expect(params[0]).toEqual(data);
    expect(params[1]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// findAllCategories
// ---------------------------------------------------------------------------

describe("configRepository — findAllCategories", () => {
  test("retorna lista de categorias com campos corretos", async () => {
    const rows = [
      { id: 1, nome: "Drones", slug: "drones", ativo: 1 },
      { id: 2, nome: "Serviços", slug: "servicos", ativo: 1 },
    ];
    mockQuery([rows]);

    const result = await repo.findAllCategories();

    expect(result).toEqual(rows);
    const [sql] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("from categories");
    expect(sql.toLowerCase()).toContain("order by nome");
  });
});

// ---------------------------------------------------------------------------
// insertCategory
// ---------------------------------------------------------------------------

describe("configRepository — insertCategory", () => {
  test("nome é trimado, slug null quando omitido, ativo 1 para true", async () => {
    mockQuery([{ insertId: 5 }]);

    const result = await repo.insertCategory("  Sementes  ", null, true);

    expect(result).toBe(5);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into categories");
    expect(params[0]).toBe("Sementes"); // trim aplicado
    expect(params[1]).toBeNull();        // slug null
    expect(params[2]).toBe(1);           // ativo: true → 1
  });

  test("ativo false → 0", async () => {
    mockQuery([{ insertId: 6 }]);

    await repo.insertCategory("Inativa", "inativa", false);

    const [, params] = pool.query.mock.calls[0];
    expect(params[2]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateCategoryById
// ---------------------------------------------------------------------------

describe("configRepository — updateCategoryById", () => {
  test("passa nome, slug, ativo e id nessa ordem, retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const result = await repo.updateCategoryById(3, "Novo Nome", "novo-nome", true);

    expect(result).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update categories set nome = ?");
    expect(params).toEqual(["Novo Nome", "novo-nome", 1, 3]); // ativo true → 1, id ao final
  });

  test("retorna 0 quando id não existe", async () => {
    mockQuery([{ affectedRows: 0 }]);

    const result = await repo.updateCategoryById(999, "X", null, false);
    expect(result).toBe(0);
  });
});
