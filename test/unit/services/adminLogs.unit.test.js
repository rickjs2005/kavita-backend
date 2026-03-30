/**
 * test/unit/services/adminLogs.unit.test.js
 *
 * O que está sendo testado:
 *   - Parâmetros válidos → insertLog chamado corretamente
 *   - Parâmetros incompletos (adminId, acao ou entidade ausentes) → early return, sem query
 *   - Falha do repository → logger.error chamado, erro NÃO propagado ao caller
 *   - entidadeId opcional: default null
 *   - registrarLog: wrapper posicional delega para logAdminAction
 */

"use strict";

const REPO_PATH = require.resolve("../../../repositories/adminLogsRepository");
const LOGGER_PATH = require.resolve("../../../lib");

describe("adminLogs — logAdminAction", () => {
  let repoMock;
  let loggerMock;
  let service;

  beforeEach(() => {
    jest.resetModules();

    repoMock = { insertLog: jest.fn().mockResolvedValue(undefined) };
    loggerMock = { logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } };

    jest.doMock(REPO_PATH, () => repoMock);
    jest.doMock(LOGGER_PATH, () => loggerMock);

    service = require("../../../services/adminLogs");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("chama insertLog com os parâmetros corretos", async () => {
    await service.logAdminAction({ adminId: 1, acao: "criou", entidade: "produto", entidadeId: 5 });

    expect(repoMock.insertLog).toHaveBeenCalledWith({
      adminId: 1,
      acao: "criou",
      entidade: "produto",
      entidadeId: 5,
    });
  });

  test("entidadeId omitido → insertLog recebe entidadeId null", async () => {
    await service.logAdminAction({ adminId: 2, acao: "editou", entidade: "categoria" });

    expect(repoMock.insertLog).toHaveBeenCalledWith({
      adminId: 2,
      acao: "editou",
      entidade: "categoria",
      entidadeId: null,
    });
  });

  test.each([
    [{ acao: "criou", entidade: "produto" }],           // adminId ausente
    [{ adminId: 1, entidade: "produto" }],               // acao ausente
    [{ adminId: 1, acao: "criou" }],                     // entidade ausente
    [{ adminId: 0, acao: "criou", entidade: "produto" }], // adminId falsy (0)
    [{}],                                                // todos ausentes
    [undefined],                                         // chamada sem argumento
  ])("params incompletos %j → retorna sem chamar insertLog", async (params) => {
    await service.logAdminAction(params);
    expect(repoMock.insertLog).not.toHaveBeenCalled();
  });

  test("falha do repository → logger.error chamado com contexto completo", async () => {
    const dbError = new Error("Connection lost");
    repoMock.insertLog.mockRejectedValueOnce(dbError);

    // não deve lançar
    await expect(
      service.logAdminAction({ adminId: 3, acao: "deletou", entidade: "produto", entidadeId: 9 })
    ).resolves.toBeUndefined();

    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 3,
        acao: "deletou",
        entidade: "produto",
        entidadeId: 9,
        err: dbError,
      }),
      expect.any(String)
    );
  });

  test("falha do repository → erro NÃO propaga ao caller", async () => {
    repoMock.insertLog.mockRejectedValueOnce(new Error("DB offline"));

    await expect(
      service.logAdminAction({ adminId: 1, acao: "criou", entidade: "produto" })
    ).resolves.toBeUndefined();
  });
});

describe("adminLogs — registrarLog (wrapper posicional)", () => {
  let repoMock;
  let service;

  beforeEach(() => {
    jest.resetModules();

    repoMock = { insertLog: jest.fn().mockResolvedValue(undefined) };
    jest.doMock(REPO_PATH, () => repoMock);
    jest.doMock(LOGGER_PATH, () => ({ logger: { error: jest.fn() } }));

    service = require("../../../services/adminLogs");
  });

  test("delega para logAdminAction com os mesmos parâmetros", async () => {
    await service.registrarLog(5, "criou", "drone", 10);

    expect(repoMock.insertLog).toHaveBeenCalledWith({
      adminId: 5,
      acao: "criou",
      entidade: "drone",
      entidadeId: 10,
    });
  });

  test("entidadeId omitido → null", async () => {
    await service.registrarLog(2, "editou", "hero");

    expect(repoMock.insertLog).toHaveBeenCalledWith({
      adminId: 2,
      acao: "editou",
      entidade: "hero",
      entidadeId: null,
    });
  });
});
