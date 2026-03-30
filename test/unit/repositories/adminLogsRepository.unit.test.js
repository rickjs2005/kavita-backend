/**
 * test/unit/repositories/adminLogsRepository.unit.test.js
 *
 * O que está sendo testado:
 *   - SQL correto (INSERT na tabela admin_logs)
 *   - Parâmetros na ordem correta: admin_id, acao, entidade, entidade_id
 *   - entidadeId opcional: default null quando omitido
 *   - Erros de pool propagam sem tratamento (política do repository)
 */

"use strict";

jest.mock("../../../config/pool", () => ({
  query: jest.fn(),
}));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/adminLogsRepository");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("adminLogsRepository — insertLog", () => {
  test("executa INSERT com os quatro parâmetros na ordem correta", async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.insertLog({ adminId: 7, acao: "criou", entidade: "produto", entidadeId: 42 });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO admin_logs/i);
    expect(params).toEqual([7, "criou", "produto", 42]);
  });

  test("entidadeId omitido → null no quarto parâmetro", async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.insertLog({ adminId: 3, acao: "editou", entidade: "categoria" });

    const [, params] = pool.query.mock.calls[0];
    expect(params[3]).toBeNull();
  });

  test("propaga erro do pool sem tratamento", async () => {
    pool.query.mockRejectedValueOnce(new Error("DB offline"));

    await expect(
      repo.insertLog({ adminId: 1, acao: "deletou", entidade: "produto" })
    ).rejects.toThrow("DB offline");
  });
});
