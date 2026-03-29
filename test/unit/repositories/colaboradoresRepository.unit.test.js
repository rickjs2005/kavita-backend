/**
 * test/unit/repositories/colaboradoresRepository.unit.test.js
 *
 * Verifica SQL exato, ordem de parâmetros e mapeamento de retorno.
 * Nenhuma lógica de negócio existe no repository — só validamos
 * que a camada de dados faz exatamente o que o service espera.
 */

"use strict";

jest.mock("../../../config/pool", () => ({ query: jest.fn() }));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/colaboradoresRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// listPendingColaboradores
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — listPendingColaboradores", () => {
  test("retorna linhas com verificado=0 (JOIN com colaborador_images)", async () => {
    const rows = [{ id: 1, nome: "João", verificado: 0, imagem: "/uploads/c/img.jpg" }];
    mockQuery([rows]);

    const result = await repo.listPendingColaboradores();

    expect(result).toEqual(rows);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("verificado = 0");
    expect(sql).toContain("colaborador_images");
    expect(sql).toContain("ORDER BY c.created_at DESC");
  });

  test("retorna array vazio quando não há pendentes", async () => {
    mockQuery([[]]);
    expect(await repo.listPendingColaboradores()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findColaboradorById
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — findColaboradorById", () => {
  test("retorna a linha quando encontrada", async () => {
    const row = { id: 5, email: "a@b.com", nome: "Ana" };
    mockQuery([[row]]);

    const result = await repo.findColaboradorById(5);

    expect(result).toEqual(row);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE id = ?");
    expect(params).toEqual([5]);
  });

  test("retorna null quando não encontrado", async () => {
    mockQuery([[]]);
    expect(await repo.findColaboradorById(999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getColaboradorImages
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — getColaboradorImages", () => {
  test("retorna paths das imagens do colaborador", async () => {
    const rows = [{ path: "/uploads/colaboradores/a.jpg" }];
    mockQuery([rows]);

    const result = await repo.getColaboradorImages(3);

    expect(result).toEqual(rows);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("colaborador_id = ?");
    expect(params).toEqual([3]);
  });

  test("retorna array vazio quando colaborador não tem imagens", async () => {
    mockQuery([[]]);
    expect(await repo.getColaboradorImages(3)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createColaborador
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — createColaborador", () => {
  test("insere linha e retorna insertId; verificado como último bind param", async () => {
    mockQuery([{ insertId: 42 }]);

    const id = await repo.createColaborador({
      nome: "Pedro",
      cargo: "Tosador",
      whatsapp: "31999",
      email: "p@p.com",
      descricao: "Desc",
      especialidade_id: 2,
      verificado: 0,
    });

    expect(id).toBe(42);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO colaboradores");
    // verificado agora é parâmetro bind (não hardcoded)
    expect(params).toEqual(["Pedro", "Tosador", "31999", "p@p.com", "Desc", 2, 0]);
  });

  test("cargo e descricao ausentes viram null", async () => {
    mockQuery([{ insertId: 1 }]);

    await repo.createColaborador({
      nome: "X",
      cargo: undefined,
      whatsapp: "1",
      email: "x@x.com",
      descricao: undefined,
      especialidade_id: 1,
      verificado: 1,
    });

    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBeNull(); // cargo
    expect(params[4]).toBeNull(); // descricao
  });
});

// ---------------------------------------------------------------------------
// insertColaboradorImage / updateColaboradorImage
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — insertColaboradorImage", () => {
  test("INSERT em colaborador_images com colaborador_id e path", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.insertColaboradorImage(10, "/uploads/colaboradores/foto.jpg");

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO colaborador_images");
    expect(params).toEqual([10, "/uploads/colaboradores/foto.jpg"]);
  });
});

describe("colaboradoresRepository — updateColaboradorImage", () => {
  test("UPDATE colaboradores SET imagem com id correto", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.updateColaboradorImage(10, "/uploads/colaboradores/foto.jpg");

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE colaboradores SET imagem = ?");
    expect(params).toEqual(["/uploads/colaboradores/foto.jpg", 10]);
  });
});

// ---------------------------------------------------------------------------
// verifyColaborador
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — verifyColaborador", () => {
  test("UPDATE verificado = 1 com id correto", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.verifyColaborador(7);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SET verificado = 1");
    expect(params).toEqual([7]);
  });
});

// ---------------------------------------------------------------------------
// deleteColaboradorImages / deleteColaborador
// ---------------------------------------------------------------------------

describe("colaboradoresRepository — deleteColaboradorImages", () => {
  test("DELETE FROM colaborador_images WHERE colaborador_id = ?", async () => {
    mockQuery([{ affectedRows: 2 }]);

    await repo.deleteColaboradorImages(4);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM colaborador_images");
    expect(sql).toContain("colaborador_id = ?");
    expect(params).toEqual([4]);
  });
});

describe("colaboradoresRepository — deleteColaborador", () => {
  test("retorna affectedRows=1 após deleção", async () => {
    mockQuery([{ affectedRows: 1 }]);
    expect(await repo.deleteColaborador(4)).toBe(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM colaboradores");
    expect(params).toEqual([4]);
  });

  test("retorna 0 quando colaborador não existe", async () => {
    mockQuery([{ affectedRows: 0 }]);
    expect(await repo.deleteColaborador(999)).toBe(0);
  });
});
