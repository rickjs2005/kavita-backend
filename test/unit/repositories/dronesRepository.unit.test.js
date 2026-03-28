/**
 * test/unit/repositories/dronesRepository.unit.test.js
 *
 * Testes unitários do dronesRepository.
 *
 * Estratégia: mock do pool.query no nível do módulo.
 * O que está sendo testado:
 *   - que cada função envia o SQL correto
 *   - que os parâmetros são repassados na ordem certa
 *   - que o retorno é mapeado corretamente (ex: rows[0] ?? null)
 *   - que nenhuma função vaza dados sem passar pelo pool
 *
 * O que NÃO está sendo testado:
 *   - sintaxe SQL (responsabilidade dos testes de integração com banco real)
 *   - lógica de negócio (responsabilidade dos services)
 */

"use strict";

jest.mock("../../../config/pool");

const pool = require("../../../config/pool");
const repo = require("../../../repositories/dronesRepository");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// drone_page_settings
// ---------------------------------------------------------------------------

describe("dronesRepository — drone_page_settings", () => {
  test("findPageSettings: retorna primeiro row ou null", async () => {
    const row = { id: 1, hero_title: "Drones" };
    mockQuery([[row]]);

    const result = await repo.findPageSettings();

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("drone_page_settings");
  });

  test("findPageSettings: retorna null quando tabela vazia", async () => {
    mockQuery([[]]);
    const result = await repo.findPageSettings();
    expect(result).toBeNull();
  });

  test("insertPageSettings: retorna insertId", async () => {
    mockQuery([{ insertId: 42 }]);
    const vals = new Array(15).fill("val");
    const result = await repo.insertPageSettings(vals);
    expect(result).toBe(42);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into drone_page_settings");
    expect(params).toEqual(vals);
  });

  test("updatePageSettings: retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const vals = new Array(15).fill("v");
    const result = await repo.updatePageSettings(7, vals);
    expect(result).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update drone_page_settings");
    expect(params).toEqual([...vals, 7]); // id é o último parâmetro
  });
});

// ---------------------------------------------------------------------------
// drone_models
// ---------------------------------------------------------------------------

describe("dronesRepository — drone_models", () => {
  test("listModels: passa where e params corretamente", async () => {
    const rows = [{ id: 1, key: "ag500" }];
    mockQuery([rows]);

    const result = await repo.listModels("WHERE is_active=1", []);

    expect(result).toEqual(rows);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("drone_models");
    expect(sql).toContain("WHERE is_active=1");
    expect(params).toEqual([]);
  });

  test("findModelByKey: retorna row ou null", async () => {
    const row = { id: 2, key: "ag500" };
    mockQuery([[row]]);

    const result = await repo.findModelByKey("ag500");

    expect(result).toEqual(row);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["ag500"]);
  });

  test("findModelByKey: retorna null quando não encontrado", async () => {
    mockQuery([[]]);
    const result = await repo.findModelByKey("naoexiste");
    expect(result).toBeNull();
  });

  test("insertModel: passa parâmetros na ordem correta", async () => {
    mockQuery([{ insertId: 10 }]);

    const result = await repo.insertModel("ag500", "AG-500", 1, 5);

    expect(result).toBe(10);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into drone_models");
    expect(params).toEqual(["ag500", "AG-500", 1, 5]);
  });

  test("updateModel: monta SET dinâmico e adiciona id ao final", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const result = await repo.updateModel(3, ["label=?", "is_active=?"], ["Novo", 0]);

    expect(result).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("label=?");
    expect(sql).toContain("is_active=?");
    expect(params).toEqual(["Novo", 0, 3]); // id é o último
  });

  test("deleteModel: retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const result = await repo.deleteModel(5);

    expect(result).toBe(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([5]);
  });
});

// ---------------------------------------------------------------------------
// drone_gallery_items
// ---------------------------------------------------------------------------

describe("dronesRepository — drone_gallery_items", () => {
  test("countGallery: retorna número total", async () => {
    mockQuery([[{ total: 12 }]]);
    const result = await repo.countGallery("", []);
    expect(result).toBe(12);
  });

  test("countGallery: retorna 0 quando não há itens", async () => {
    mockQuery([[{ total: 0 }]]);
    const result = await repo.countGallery("WHERE model_key=?", ["x"]);
    expect(result).toBe(0);
  });

  test("listGallery: passa limit e offset como últimos params", async () => {
    const rows = [{ id: 1 }];
    mockQuery([rows]);

    const result = await repo.listGallery("", [], "", 10, 20);

    expect(result).toEqual(rows);
    const [, params] = pool.query.mock.calls[0];
    expect(params.slice(-2)).toEqual([10, 20]); // limit, offset sempre por último
  });

  test("insertGalleryItem: constrói placeholders dinamicamente", async () => {
    mockQuery([{ insertId: 7 }]);

    const result = await repo.insertGalleryItem(
      ["model_key", "media_type", "media_path"],
      ["ag500", "image", "/uploads/drones/img.webp"]
    );

    expect(result).toBe(7);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("drone_gallery_items");
    expect(sql).toContain("?, ?, ?"); // 3 placeholders para 3 colunas
    expect(params).toEqual(["ag500", "image", "/uploads/drones/img.webp"]);
  });

  test("deleteGalleryItem: retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const result = await repo.deleteGalleryItem(99);
    expect(result).toBe(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([99]);
  });
});

// ---------------------------------------------------------------------------
// drone_comments
// ---------------------------------------------------------------------------

describe("dronesRepository — drone_comments", () => {
  test("findCommentById: retorna row ou null", async () => {
    const row = { id: 3, display_name: "Rick", comment_text: "Ótimo!" };
    mockQuery([[row]]);

    const result = await repo.findCommentById(3);

    expect(result).toEqual(row);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([3]);
  });

  test("findCommentById: retorna null quando não encontrado", async () => {
    mockQuery([[]]);
    const result = await repo.findCommentById(999);
    expect(result).toBeNull();
  });

  test("setCommentStatus: passa status e id na ordem certa", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const result = await repo.setCommentStatus(10, "approved");

    expect(result).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update drone_comments set status=?");
    expect(params).toEqual(["approved", 10]); // status primeiro, id depois
  });

  test("deleteComment: retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const result = await repo.deleteComment(15);
    expect(result).toBe(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([15]);
  });
});

// ---------------------------------------------------------------------------
// drone_representatives
// ---------------------------------------------------------------------------

describe("dronesRepository — drone_representatives", () => {
  test("countRepresentatives: retorna número total", async () => {
    mockQuery([[{ total: 5 }]]);
    const result = await repo.countRepresentatives("", []);
    expect(result).toBe(5);
  });

  test("insertRepresentative: passa 14 parâmetros", async () => {
    mockQuery([{ insertId: 20 }]);

    const vals = new Array(14).fill("val");
    const result = await repo.insertRepresentative(vals);

    expect(result).toBe(20);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into drone_representatives");
    expect(params).toHaveLength(14);
  });

  test("deleteRepresentative: retorna affectedRows", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const result = await repo.deleteRepresentative(8);
    expect(result).toBe(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([8]);
  });

  test("updateRepresentative: id é o último param", async () => {
    mockQuery([{ affectedRows: 1 }]);

    const result = await repo.updateRepresentative(4, ["name=?"], ["Novo Nome"]);

    expect(result).toBe(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["Novo Nome", 4]);
  });
});

// ---------------------------------------------------------------------------
// Schema introspection helpers
// ---------------------------------------------------------------------------

describe("dronesRepository — schema introspection", () => {
  test("tableExists: retorna true quando count > 0", async () => {
    mockQuery([[{ total: 1 }]]);
    const result = await repo.tableExists("drone_models");
    expect(result).toBe(true);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["drone_models"]);
  });

  test("tableExists: retorna false quando count = 0", async () => {
    mockQuery([[{ total: 0 }]]);
    const result = await repo.tableExists("nao_existe");
    expect(result).toBe(false);
  });

  test("columnExists: retorna true quando coluna encontrada", async () => {
    mockQuery([[{ total: 1 }]]);
    const result = await repo.columnExists("drone_models", "is_active");
    expect(result).toBe(true);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toContain("is_active");
  });
});
