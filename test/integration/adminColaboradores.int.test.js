/**
 * test/integration/adminColaboradores.int.test.js
 *
 * Rotas testadas (routes/admin/adminColaboradores.js — LEGADO):
 *   POST   /api/admin/colaboradores/public   (sem auth — "Trabalhe conosco")
 *   POST   /api/admin/colaboradores          (verifyAdmin — cadastro direto)
 *   GET    /api/admin/colaboradores/pending  (verifyAdmin)
 *   PUT    /api/admin/colaboradores/:id/verify (verifyAdmin)
 *   DELETE /api/admin/colaboradores/:id      (verifyAdmin)
 *
 * Nota sobre o contrato legado:
 *   - GET /pending → array cru, sem envelope { ok, data }
 *   - POST 201 → { message: "..." }, sem { ok: true }
 *   - Erros → { ok: false, code, message }
 *
 * Nota sobre upload:
 *   - mediaService.upload é mockado como no-op (sem multer real)
 *   - Todos os testes enviam JSON (req.file = undefined)
 *   - Fluxo de persistência de imagem não é testado aqui — é domínio de mediaService
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

const POOL_PATH = require.resolve("../../config/pool");
const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const MEDIA_SERVICE_PATH = require.resolve("../../services/mediaService");
const FILE_VALIDATION_PATH = require.resolve("../../utils/fileValidation");
const ROUTER_PATH = require.resolve("../../routes/admin/adminColaboradores");
const MOUNT = "/api/admin/colaboradores";

// ---------------------------------------------------------------------------
// Helpers de setup
// ---------------------------------------------------------------------------

function setupAuthenticated() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };

  const verifyAdminMock = jest.fn((req, _res, next) => {
    req.admin = { id: 1, role: "master" };
    return next();
  });

  // no-op multer: não processa multipart, não seta req.file
  const mediaServiceMock = {
    upload: { single: jest.fn(() => (_req, _res, next) => next()) },
    persistMedia: jest.fn().mockResolvedValue([{ path: "/uploads/colaboradores/img.jpg", key: "/abs/img.jpg" }]),
    removeMedia: jest.fn().mockResolvedValue(undefined),
  };

  const fileValidationMock = {
    validateFileMagicBytes: jest.fn().mockReturnValue({ valid: true }),
  };

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);
  jest.doMock(MEDIA_SERVICE_PATH, () => mediaServiceMock);
  jest.doMock(FILE_VALIDATION_PATH, () => fileValidationMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock, verifyAdminMock, mediaServiceMock };
}

function setupBlocked401() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };

  const verifyAdminMock = jest.fn((_req, res) =>
    res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Não autenticado." })
  );

  const mediaServiceMock = {
    upload: { single: jest.fn(() => (_req, _res, next) => next()) },
    persistMedia: jest.fn(),
    removeMedia: jest.fn(),
  };

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);
  jest.doMock(MEDIA_SERVICE_PATH, () => mediaServiceMock);
  jest.doMock(FILE_VALIDATION_PATH, () => ({ validateFileMagicBytes: jest.fn() }));

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock };
}

// ---------------------------------------------------------------------------
// Auth guard — rotas protegidas bloqueiam sem token
// ---------------------------------------------------------------------------

describe("adminColaboradores — auth guard (rotas protegidas)", () => {
  test("GET /pending sem auth → 401, sem consulta ao banco", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).get(`${MOUNT}/pending`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("PUT /:id/verify sem auth → 401", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).put(`${MOUNT}/5/verify`);

    expect(res.status).toBe(401);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("DELETE /:id sem auth → 401", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(401);
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /public — Trabalhe conosco (sem auth — público na rota)
// ---------------------------------------------------------------------------

describe("POST /api/admin/colaboradores/public", () => {
  test("400: campos obrigatórios ausentes → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, poolMock } = setupAuthenticated();

    const res = await request(app).post(`${MOUNT}/public`).send({
      nome: "João", // falta whatsapp, email, especialidade_id
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("400: nome ausente → VALIDATION_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();

    const res = await request(app).post(`${MOUNT}/public`).send({
      whatsapp: "31999999999",
      email: "joao@test.com",
      especialidade_id: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("201: cadastra colaborador pendente (verificado=0) sem imagem", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ insertId: 77 }]);

    const res = await request(app).post(`${MOUNT}/public`).send({
      nome: "João da Silva",
      whatsapp: "31999999999",
      email: "joao@test.com",
      especialidade_id: 2,
      cargo: "Tosador",
      descricao: "10 anos de experiência",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: expect.any(String) });

    // verificado=0 está INLINE no SQL (não é parâmetro bind) — comportamento legado documentado
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO colaboradores");
    expect(sql).toContain(", 0)"); // verificado = 0 hardcoded no SQL
    expect(params[0]).toBe("João da Silva");
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).post(`${MOUNT}/public`).send({
      nome: "João",
      whatsapp: "31999999999",
      email: "joao@test.com",
      especialidade_id: 1,
    });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST / — Cadastro admin direto
// ---------------------------------------------------------------------------

describe("POST /api/admin/colaboradores (admin)", () => {
  test("400: campos obrigatórios ausentes → VALIDATION_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();

    const res = await request(app).post(MOUNT).send({ nome: "Maria" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("201: cadastra colaborador com verificado=1 (admin cria já aprovado)", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ insertId: 55 }]);

    const res = await request(app).post(MOUNT).send({
      nome: "Maria Souza",
      whatsapp: "31888888888",
      email: "maria@test.com",
      especialidade_id: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: expect.any(String) });

    // Diferença crítica: admin POST → verificado=1 inline, public POST → verificado=0 inline
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO colaboradores");
    expect(sql).toContain(", 1)"); // verificado = 1 hardcoded no SQL
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).post(MOUNT).send({
      nome: "Maria",
      whatsapp: "31888888888",
      email: "maria@test.com",
      especialidade_id: 1,
    });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// GET /pending
// ---------------------------------------------------------------------------

describe("GET /api/admin/colaboradores/pending", () => {
  test("200: retorna array de colaboradores pendentes", async () => {
    const { app, poolMock } = setupAuthenticated();

    const rows = [
      { id: 1, nome: "Pedro", cargo: "Veterinário", verificado: 0, imagem: null },
      { id: 2, nome: "Ana", cargo: "Tosadora", verificado: 0, imagem: "/uploads/colaboradores/ana.jpg" },
    ];
    poolMock.query.mockResolvedValueOnce([rows]);

    const res = await request(app).get(`${MOUNT}/pending`);

    // Contrato legado: array direto, sem envelope { ok, data }
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 1, nome: "Pedro" });
  });

  test("200: array vazio quando nenhum colaborador pendente", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get(`${MOUNT}/pending`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).get(`${MOUNT}/pending`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id/verify
// ---------------------------------------------------------------------------

describe("PUT /api/admin/colaboradores/:id/verify", () => {
  test("404: colaborador não encontrado → NOT_FOUND", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([[]]); // SELECT retorna vazio

    const res = await request(app).put(`${MOUNT}/999/verify`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: aprova colaborador (verificado=1) e retorna mensagem", async () => {
    const { app, poolMock } = setupAuthenticated();

    poolMock.query
      .mockResolvedValueOnce([[{ email: "pedro@test.com", nome: "Pedro" }]]) // SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE verificado=1

    const res = await request(app).put(`${MOUNT}/1/verify`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("verificado") });

    const updateCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE colaboradores SET verificado = 1")
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toEqual(["1"]);
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).put(`${MOUNT}/1/verify`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/colaboradores/:id", () => {
  test("404: colaborador não existe (affectedRows=0) → NOT_FOUND", async () => {
    const { app, poolMock } = setupAuthenticated();

    poolMock.query
      .mockResolvedValueOnce([[]]) // SELECT images
      .mockResolvedValueOnce([{}]) // DELETE images
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // DELETE colaborador

    const res = await request(app).delete(`${MOUNT}/999`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: remove colaborador sem imagens", async () => {
    const { app, poolMock, mediaServiceMock } = setupAuthenticated();

    poolMock.query
      .mockResolvedValueOnce([[]]) // SELECT images → vazio
      .mockResolvedValueOnce([{}]) // DELETE images
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE colaborador

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("removido") });
    expect(mediaServiceMock.removeMedia).not.toHaveBeenCalled(); // sem imagens, não chama removeMedia
  });

  test("200: remove colaborador com imagens e dispara removeMedia (fire-and-forget)", async () => {
    const { app, poolMock, mediaServiceMock } = setupAuthenticated();

    poolMock.query
      .mockResolvedValueOnce([[{ path: "/uploads/colaboradores/foto.jpg" }]]) // SELECT images
      .mockResolvedValueOnce([{}]) // DELETE images
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE colaborador

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    // removeMedia é fire-and-forget — apenas verifica que foi chamado
    expect(mediaServiceMock.removeMedia).toHaveBeenCalledWith(
      expect.arrayContaining([{ path: "/uploads/colaboradores/foto.jpg" }])
    );
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).delete(`${MOUNT}/1`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
