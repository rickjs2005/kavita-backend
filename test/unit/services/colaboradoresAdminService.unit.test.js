/**
 * test/unit/services/colaboradoresAdminService.unit.test.js
 *
 * Cobre:
 *   createPublic  — verificado=0, file validation, persistImage
 *   createAdmin   — verificado=1, mesma lógica de imagem
 *   listPending   — delega ao repo
 *   verify        — NOT_FOUND, verifyColaborador, email fire-and-forget
 *   remove        — getImages, deleteImages, deleteColaborador, NOT_FOUND, removeMedia
 *
 * Mock strategy: jest.doMock por describe para isolar require cache.
 */

"use strict";

const REPO_PATH = require.resolve("../../../repositories/colaboradoresRepository");
const MEDIA_PATH = require.resolve("../../../services/mediaService");
const FILE_VAL_PATH = require.resolve("../../../utils/fileValidation");
const SVC_PATH = require.resolve("../../../services/colaboradoresAdminService");

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setupModule(repoOverrides = {}, mediaOverrides = {}, fileValOverrides = {}) {
  jest.resetModules();

  const repoMock = {
    listPendingColaboradores: jest.fn(),
    findColaboradorById: jest.fn(),
    getColaboradorImages: jest.fn(),
    createColaborador: jest.fn(),
    insertColaboradorImage: jest.fn().mockResolvedValue(undefined),
    updateColaboradorImage: jest.fn().mockResolvedValue(undefined),
    verifyColaborador: jest.fn().mockResolvedValue(undefined),
    deleteColaboradorImages: jest.fn().mockResolvedValue(undefined),
    deleteColaborador: jest.fn(),
    ...repoOverrides,
  };

  const mediaMock = {
    persistMedia: jest.fn().mockResolvedValue([{ path: "/uploads/colaboradores/img.jpg", key: "/abs/img.jpg" }]),
    removeMedia: jest.fn().mockResolvedValue(undefined),
    upload: { single: jest.fn(() => (_req, _res, next) => next()) },
    ...mediaOverrides,
  };

  const fileValMock = {
    validateFileMagicBytes: jest.fn().mockReturnValue({ valid: true }),
    ...fileValOverrides,
  };

  jest.doMock(REPO_PATH, () => repoMock);
  jest.doMock(MEDIA_PATH, () => mediaMock);
  jest.doMock(FILE_VAL_PATH, () => fileValMock);

  const svc = require(SVC_PATH);
  return { svc, repoMock, mediaMock, fileValMock };
}

function makeFile() {
  return { path: "/tmp/upload_test.jpg", originalname: "foto.jpg", size: 100 };
}

function makeColab(overrides = {}) {
  return { id: 1, nome: "João", email: "joao@test.com", ...overrides };
}

// ---------------------------------------------------------------------------
// createPublic
// ---------------------------------------------------------------------------

describe("colaboradoresAdminService.createPublic", () => {
  test("chama repo com verificado=0", async () => {
    const { svc, repoMock } = setupModule({
      createColaborador: jest.fn().mockResolvedValue(10),
    });

    await svc.createPublic(
      { nome: "João", whatsapp: "31999", email: "j@t.com", especialidade_id: 1 },
      undefined
    );

    expect(repoMock.createColaborador).toHaveBeenCalledWith(
      expect.objectContaining({ verificado: 0 })
    );
  });

  test("retorna { id } com o insertId do repo", async () => {
    const { svc } = setupModule({ createColaborador: jest.fn().mockResolvedValue(77) });
    const result = await svc.createPublic(
      { nome: "X", whatsapp: "1", email: "x@x.com", especialidade_id: 2 },
      undefined
    );
    expect(result).toEqual({ id: 77 });
  });

  test("sem file: não chama persistMedia", async () => {
    const { svc, mediaMock } = setupModule({ createColaborador: jest.fn().mockResolvedValue(1) });
    await svc.createPublic(
      { nome: "X", whatsapp: "1", email: "x@x.com", especialidade_id: 1 },
      undefined
    );
    expect(mediaMock.persistMedia).not.toHaveBeenCalled();
  });

  test("com file válido: chama validateFileMagicBytes + persistMedia + repo image funcs", async () => {
    const { svc, repoMock, mediaMock, fileValMock } = setupModule({
      createColaborador: jest.fn().mockResolvedValue(5),
    });
    const file = makeFile();

    await svc.createPublic(
      { nome: "X", whatsapp: "1", email: "x@x.com", especialidade_id: 1 },
      file
    );

    expect(fileValMock.validateFileMagicBytes).toHaveBeenCalledWith(file.path);
    expect(mediaMock.persistMedia).toHaveBeenCalledWith([file], { folder: "colaboradores" });
    expect(repoMock.insertColaboradorImage).toHaveBeenCalledWith(5, "/uploads/colaboradores/img.jpg");
    expect(repoMock.updateColaboradorImage).toHaveBeenCalledWith(5, "/uploads/colaboradores/img.jpg");
  });

  test("file inválido: lança AppError 400 VALIDATION_ERROR, não chama createColaborador", async () => {
    const { svc, repoMock } = setupModule(
      {},
      {},
      { validateFileMagicBytes: jest.fn().mockReturnValue({ valid: false }) }
    );

    await expect(
      svc.createPublic({ nome: "X", whatsapp: "1", email: "x@x.com", especialidade_id: 1 }, makeFile())
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    expect(repoMock.createColaborador).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAdmin
// ---------------------------------------------------------------------------

describe("colaboradoresAdminService.createAdmin", () => {
  test("chama repo com verificado=1", async () => {
    const { svc, repoMock } = setupModule({ createColaborador: jest.fn().mockResolvedValue(3) });

    await svc.createAdmin(
      { nome: "Maria", whatsapp: "11999", email: "m@t.com", especialidade_id: 2 },
      undefined
    );

    expect(repoMock.createColaborador).toHaveBeenCalledWith(
      expect.objectContaining({ verificado: 1 })
    );
  });
});

// ---------------------------------------------------------------------------
// listPending
// ---------------------------------------------------------------------------

describe("colaboradoresAdminService.listPending", () => {
  test("delega para repo.listPendingColaboradores e retorna resultado", async () => {
    const rows = [makeColab()];
    const { svc, repoMock } = setupModule({ listPendingColaboradores: jest.fn().mockResolvedValue(rows) });

    const result = await svc.listPending();

    expect(result).toBe(rows);
    expect(repoMock.listPendingColaboradores).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

describe("colaboradoresAdminService.verify", () => {
  test("NOT_FOUND quando findColaboradorById retorna null", async () => {
    const { svc, repoMock } = setupModule({ findColaboradorById: jest.fn().mockResolvedValue(null) });

    await expect(svc.verify(999)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(repoMock.verifyColaborador).not.toHaveBeenCalled();
  });

  test("chama verifyColaborador com o id correto", async () => {
    const { svc, repoMock } = setupModule({
      findColaboradorById: jest.fn().mockResolvedValue(makeColab({ id: 7 })),
    });

    await svc.verify(7);

    expect(repoMock.verifyColaborador).toHaveBeenCalledWith(7);
  });

  test("sucesso: resolve sem lançar (email é fire-and-forget)", async () => {
    const { svc } = setupModule({
      findColaboradorById: jest.fn().mockResolvedValue(makeColab()),
    });
    await expect(svc.verify(1)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("colaboradoresAdminService.remove", () => {
  test("NOT_FOUND quando deleteColaborador retorna 0 (após deletar imagens)", async () => {
    const { svc, repoMock } = setupModule({
      getColaboradorImages: jest.fn().mockResolvedValue([]),
      deleteColaboradorImages: jest.fn().mockResolvedValue(undefined),
      deleteColaborador: jest.fn().mockResolvedValue(0),
    });

    await expect(svc.remove(999)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("remove colaborador sem imagens: não chama removeMedia", async () => {
    const { svc, mediaMock } = setupModule({
      getColaboradorImages: jest.fn().mockResolvedValue([]),
      deleteColaboradorImages: jest.fn().mockResolvedValue(undefined),
      deleteColaborador: jest.fn().mockResolvedValue(1),
    });

    await svc.remove(5);

    expect(mediaMock.removeMedia).not.toHaveBeenCalled();
  });

  test("remove colaborador com imagens: chama removeMedia (fire-and-forget)", async () => {
    const imagePaths = [{ path: "/uploads/colaboradores/foto.jpg" }];
    const { svc, mediaMock } = setupModule({
      getColaboradorImages: jest.fn().mockResolvedValue(imagePaths),
      deleteColaboradorImages: jest.fn().mockResolvedValue(undefined),
      deleteColaborador: jest.fn().mockResolvedValue(1),
    });

    await svc.remove(5);

    expect(mediaMock.removeMedia).toHaveBeenCalledWith(
      expect.arrayContaining([{ path: "/uploads/colaboradores/foto.jpg" }])
    );
  });

  test("deleteColaboradorImages é chamado ANTES de deleteColaborador", async () => {
    const callOrder = [];
    const { svc } = setupModule({
      getColaboradorImages: jest.fn().mockResolvedValue([]),
      deleteColaboradorImages: jest.fn().mockImplementation(async () => { callOrder.push("images"); }),
      deleteColaborador: jest.fn().mockImplementation(async () => { callOrder.push("colaborador"); return 1; }),
    });

    await svc.remove(1);

    expect(callOrder).toEqual(["images", "colaborador"]);
  });
});
