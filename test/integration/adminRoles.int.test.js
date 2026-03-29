/**
 * test/integration/adminRoles.int.test.js
 *
 * Rotas testadas (routes/admin/adminRoles.js — padrão moderno):
 *   GET    /api/admin/roles
 *   GET    /api/admin/roles/:id
 *   POST   /api/admin/roles
 *   PUT    /api/admin/roles/:id
 *   DELETE /api/admin/roles/:id
 *
 * Contrato moderno:
 *   GET /         → { ok: true, data: [...] }
 *   GET /:id      → { ok: true, data: { id, nome, slug, ... } }
 *   POST /        → { ok: true, data: { id, ... }, message } 201
 *   PUT /:id      → { ok: true, message }
 *   DELETE /:id   → { ok: true, message }
 *   Erros         → { ok: false, code, message }
 *
 * Estratégia de mock:
 *   - rolesAdminService mockado (cobre controller + service na mesma chamada)
 *   - req.admin injetado via middleware antes do router (simula verifyAdmin)
 *   - requirePermission bypassado pelo role "master" de req.admin
 *
 * Nota sobre AppError: erros com status/code específicos são lançados dentro de
 * mockImplementation (lazy require) para garantir que usam a mesma classe AppError
 * carregada pelo controller após jest.resetModules().
 */

"use strict";

const express = require("express");
const request = require("supertest");

const SVC_PATH = require.resolve("../../services/rolesAdminService");
const ROUTER_PATH = require.resolve("../../routes/admin/adminRoles");
const MOUNT = "/api/admin/roles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cria um mock que lança AppError com o status/code dados.
 * AppError é requerido lazily (na execução da chamada) para usar o mesmo
 * módulo carregado pelo controller após jest.resetModules().
 */
function throwingAppError(message, errorCode, httpStatus) {
  return jest.fn().mockImplementation(async () => {
    const AppError = require("../../errors/AppError");
    const ERROR_CODES = require("../../constants/ErrorCodes");
    throw new AppError(message, ERROR_CODES[errorCode], httpStatus);
  });
}

function setup(svcOverrides = {}) {
  jest.resetModules();

  const svcMock = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    ...svcOverrides,
  };

  jest.doMock(SVC_PATH, () => svcMock);

  const router = require(ROUTER_PATH);

  // Build app manually to inject req.admin before the router.
  // verifyAdmin is at mount level (routes/index.js) — not tested here.
  // role "master" triggers requirePermission bypass.
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.admin = { id: 1, role: "master", permissions: [] };
    next();
  });
  app.use(MOUNT, router);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err?.status || err?.statusCode || 500;
    const code = err?.code || "SERVER_ERROR";
    res.status(status).json({ ok: false, code, message: err?.message || "Erro interno." });
  });

  return { app, svcMock };
}

function makeRole(overrides = {}) {
  return {
    id: 1,
    nome: "Gestor",
    slug: "gestor",
    descricao: null,
    is_system: 0,
    criado_em: "2024-01-01",
    permissions: ["roles_manage"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /api/admin/roles", () => {
  test("200: retorna { ok: true, data: [...] } com lista de roles", async () => {
    const roles = [makeRole({ id: 1 }), makeRole({ id: 2, nome: "Editor", slug: "editor" })];
    const { app } = setup({ list: jest.fn().mockResolvedValue(roles) });

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  test("200: data é array vazio quando não há roles", async () => {
    const { app } = setup({ list: jest.fn().mockResolvedValue([]) });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("500: erro de serviço → SERVER_ERROR", async () => {
    const { app } = setup({ list: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe("GET /api/admin/roles/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar serviço", async () => {
    const { app, svcMock } = setup();
    const res = await request(app).get(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(svcMock.getById).not.toHaveBeenCalled();
  });

  test("404: role não encontrado → NOT_FOUND", async () => {
    const { app } = setup({ getById: throwingAppError("Role não encontrado.", "NOT_FOUND", 404) });
    const res = await request(app).get(`${MOUNT}/999`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: retorna { ok: true, data: role } quando encontrado", async () => {
    const role = makeRole({ id: 7 });
    const { app } = setup({ getById: jest.fn().mockResolvedValue(role) });

    const res = await request(app).get(`${MOUNT}/7`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: 7, slug: "gestor" });
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe("POST /api/admin/roles", () => {
  test("400: nome ausente → VALIDATION_ERROR sem consultar serviço", async () => {
    const { app, svcMock } = setup();
    const res = await request(app).post(MOUNT).send({ slug: "test" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(svcMock.create).not.toHaveBeenCalled();
  });

  test("400: slug ausente → VALIDATION_ERROR sem consultar serviço", async () => {
    const { app, svcMock } = setup();
    const res = await request(app).post(MOUNT).send({ nome: "Gestor" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(svcMock.create).not.toHaveBeenCalled();
  });

  test("409: slug duplicado → CONFLICT", async () => {
    const { app } = setup({ create: throwingAppError("Já existe um role com esse slug.", "CONFLICT", 409) });
    const res = await request(app).post(MOUNT).send({ nome: "Admin", slug: "admin" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  test("201: cria role e retorna { ok, data: { id, ... }, message }", async () => {
    const created = makeRole({ id: 55, nome: "Novo", slug: "novo" });
    const { app, svcMock } = setup({ create: jest.fn().mockResolvedValue(created) });

    const res = await request(app).post(MOUNT).send({ nome: "Novo", slug: "novo" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: 55 });
    expect(res.body.message).toMatch(/criado/i);
    expect(svcMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Novo", slug: "novo" }),
      1 // req.admin.id
    );
  });

  test("500: erro de serviço → SERVER_ERROR", async () => {
    const { app } = setup({ create: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).post(MOUNT).send({ nome: "X", slug: "x" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id
// ---------------------------------------------------------------------------

describe("PUT /api/admin/roles/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar serviço", async () => {
    const { app, svcMock } = setup();
    const res = await request(app).put(`${MOUNT}/abc`).send({ nome: "X" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(svcMock.update).not.toHaveBeenCalled();
  });

  test("404: role não encontrado → NOT_FOUND", async () => {
    const { app } = setup({ update: throwingAppError("Role não encontrado.", "NOT_FOUND", 404) });
    const res = await request(app).put(`${MOUNT}/999`).send({ nome: "X" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: atualiza e retorna { ok: true, message }", async () => {
    const { app, svcMock } = setup({ update: jest.fn().mockResolvedValue(undefined) });

    const res = await request(app)
      .put(`${MOUNT}/3`)
      .send({ nome: "Novo Nome", permissions: ["roles_manage"] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/atualizado/i);
    expect(svcMock.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ nome: "Novo Nome", permissions: ["roles_manage"] }),
      1
    );
  });

  test("500: erro de serviço → SERVER_ERROR", async () => {
    const { app } = setup({ update: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).put(`${MOUNT}/1`).send({ nome: "X" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/roles/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar serviço", async () => {
    const { app, svcMock } = setup();
    const res = await request(app).delete(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(svcMock.remove).not.toHaveBeenCalled();
  });

  test("404: role não encontrado → NOT_FOUND", async () => {
    const { app } = setup({ remove: throwingAppError("Role não encontrado.", "NOT_FOUND", 404) });
    const res = await request(app).delete(`${MOUNT}/999`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("400: role de sistema não pode ser removido → VALIDATION_ERROR", async () => {
    const { app } = setup({
      remove: throwingAppError(
        "Este role é de sistema e não pode ser removido.",
        "VALIDATION_ERROR",
        400
      ),
    });
    const res = await request(app).delete(`${MOUNT}/1`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  test("200: remove role e retorna { ok: true, message }", async () => {
    const { app, svcMock } = setup({ remove: jest.fn().mockResolvedValue(undefined) });

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/removido/i);
    expect(svcMock.remove).toHaveBeenCalledWith(5, 1);
  });

  test("500: erro de serviço → SERVER_ERROR", async () => {
    const { app } = setup({ remove: jest.fn().mockRejectedValue(new Error("db fail")) });
    const res = await request(app).delete(`${MOUNT}/1`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
