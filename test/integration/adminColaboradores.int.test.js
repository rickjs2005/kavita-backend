/**
 * test/integration/adminColaboradores.int.test.js
 *
 * Rotas testadas (routes/admin/adminColaboradores.js — padrão moderno):
 *   POST   /api/admin/colaboradores/public
 *   POST   /api/admin/colaboradores
 *   GET    /api/admin/colaboradores/pending
 *   PUT    /api/admin/colaboradores/:id/verify
 *   DELETE /api/admin/colaboradores/:id
 *
 * Contrato moderno (diferença em relação ao legado):
 *   POST   → { ok: true, data: { id }, message: "..." } 201  (era { message: "..." })
 *   GET    → { ok: true, data: [...] }                       (era array cru)
 *   PUT    → { ok: true, message: "..." }                    (era { message: "..." })
 *   DELETE → { ok: true, message: "..." }                    (era { message: "..." })
 *   Erros  → { ok: false, code, message }                    (mantido)
 *
 * Estratégia de mock:
 *   - colaboradoresRepository mockado → cobre controller+service
 *   - mediaService mockado: upload no-op + persistMedia/removeMedia stubs
 *   - fileValidation mockado
 *   - Todos os testes enviam JSON (req.file = undefined)
 *   - verifyAdmin não testado aqui — está em routes/index.js (mount level)
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

const REPO_PATH = require.resolve("../../repositories/colaboradoresRepository");
const MEDIA_PATH = require.resolve("../../services/mediaService");
const FILE_VAL_PATH = require.resolve("../../utils/fileValidation");
const ROUTER_PATH = require.resolve("../../routes/admin/adminColaboradores");
const MOUNT = "/api/admin/colaboradores";

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setup(repoOverrides = {}) {
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
    upload: { single: jest.fn(() => (_req, _res, next) => next()) },
    persistMedia: jest.fn().mockResolvedValue([{ path: "/uploads/colaboradores/img.jpg" }]),
    removeMedia: jest.fn().mockResolvedValue(undefined),
  };

  const fileValMock = {
    validateFileMagicBytes: jest.fn().mockReturnValue({ valid: true }),
  };

  jest.doMock(REPO_PATH, () => repoMock);
  jest.doMock(MEDIA_PATH, () => mediaMock);
  jest.doMock(FILE_VAL_PATH, () => fileValMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, repoMock, mediaMock };
}

function validBody(overrides = {}) {
  return {
    nome: "João da Silva",
    whatsapp: "31999999999",
    email: "joao@test.com",
    especialidade_id: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /public
// ---------------------------------------------------------------------------

describe("POST /api/admin/colaboradores/public", () => {
  test("400: campo obrigatório ausente (nome) → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).post(`${MOUNT}/public`).send({
      whatsapp: "31999", email: "a@b.com", especialidade_id: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.createColaborador).not.toHaveBeenCalled();
  });

  test("400: email inválido → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).post(`${MOUNT}/public`).send(validBody({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.createColaborador).not.toHaveBeenCalled();
  });

  test("201: cria colaborador pendente (verificado=0) e retorna { ok, data: { id }, message }", async () => {
    const { app, repoMock } = setup({ createColaborador: jest.fn().mockResolvedValue(77) });

    const res = await request(app).post(`${MOUNT}/public`).send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: 77 });
    expect(res.body.message).toMatch(/avisado/i);
    expect(repoMock.createColaborador).toHaveBeenCalledWith(
      expect.objectContaining({ verificado: 0 })
    );
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({ createColaborador: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).post(`${MOUNT}/public`).send(validBody());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST / (admin)
// ---------------------------------------------------------------------------

describe("POST /api/admin/colaboradores (admin)", () => {
  test("400: campo obrigatório ausente → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).post(MOUNT).send({ nome: "Maria" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.createColaborador).not.toHaveBeenCalled();
  });

  test("201: cria colaborador aprovado (verificado=1) e retorna { ok, data: { id }, message }", async () => {
    const { app, repoMock } = setup({ createColaborador: jest.fn().mockResolvedValue(55) });

    const res = await request(app).post(MOUNT).send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: 55 });
    expect(res.body.message).toMatch(/cadastrado/i);
    expect(repoMock.createColaborador).toHaveBeenCalledWith(
      expect.objectContaining({ verificado: 1 })
    );
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({ createColaborador: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).post(MOUNT).send(validBody());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// GET /pending
// ---------------------------------------------------------------------------

describe("GET /api/admin/colaboradores/pending", () => {
  test("200: retorna { ok: true, data: [...] } com colaboradores pendentes", async () => {
    const rows = [
      { id: 1, nome: "Pedro", verificado: 0 },
      { id: 2, nome: "Ana", verificado: 0 },
    ];
    const { app } = setup({ listPendingColaboradores: jest.fn().mockResolvedValue(rows) });

    const res = await request(app).get(`${MOUNT}/pending`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ id: 1, nome: "Pedro" });
  });

  test("200: data é array vazio quando não há pendentes", async () => {
    const { app } = setup({ listPendingColaboradores: jest.fn().mockResolvedValue([]) });
    const res = await request(app).get(`${MOUNT}/pending`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      listPendingColaboradores: jest.fn().mockRejectedValue(new Error("db fail")),
    });
    const res = await request(app).get(`${MOUNT}/pending`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id/verify
// ---------------------------------------------------------------------------

describe("PUT /api/admin/colaboradores/:id/verify", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).put(`${MOUNT}/abc/verify`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.findColaboradorById).not.toHaveBeenCalled();
  });

  test("404: colaborador não encontrado → NOT_FOUND", async () => {
    const { app } = setup({ findColaboradorById: jest.fn().mockResolvedValue(null) });
    const res = await request(app).put(`${MOUNT}/999/verify`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: aprova colaborador — resposta com { ok: true, message } e verifyColaborador chamado", async () => {
    const { app, repoMock } = setup({
      findColaboradorById: jest.fn().mockResolvedValue({ id: 3, nome: "Pedro", email: "p@t.com" }),
    });

    const res = await request(app).put(`${MOUNT}/3/verify`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/verificado/i);
    expect(repoMock.verifyColaborador).toHaveBeenCalledWith(3);
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      findColaboradorById: jest.fn().mockRejectedValue(new Error("db fail")),
    });
    const res = await request(app).put(`${MOUNT}/1/verify`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/colaboradores/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).delete(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.getColaboradorImages).not.toHaveBeenCalled();
  });

  test("404: colaborador não existe (affectedRows=0) → NOT_FOUND", async () => {
    const { app } = setup({
      getColaboradorImages: jest.fn().mockResolvedValue([]),
      deleteColaborador: jest.fn().mockResolvedValue(0),
    });
    const res = await request(app).delete(`${MOUNT}/999`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: remove colaborador sem imagens — sem chamar removeMedia", async () => {
    const { app, mediaMock } = setup({
      getColaboradorImages: jest.fn().mockResolvedValue([]),
      deleteColaborador: jest.fn().mockResolvedValue(1),
    });

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/removido/i);
    expect(mediaMock.removeMedia).not.toHaveBeenCalled();
  });

  test("200: remove colaborador com imagens — dispara removeMedia (fire-and-forget)", async () => {
    const { app, mediaMock } = setup({
      getColaboradorImages: jest.fn().mockResolvedValue([{ path: "/uploads/colaboradores/foto.jpg" }]),
      deleteColaborador: jest.fn().mockResolvedValue(1),
    });

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(mediaMock.removeMedia).toHaveBeenCalledWith(
      expect.arrayContaining([{ path: "/uploads/colaboradores/foto.jpg" }])
    );
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      getColaboradorImages: jest.fn().mockRejectedValue(new Error("db fail")),
    });
    const res = await request(app).delete(`${MOUNT}/1`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
