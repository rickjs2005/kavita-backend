/**
 * test/integration/adminAdmins.int.test.js
 *
 * Rotas testadas (routes/admin/adminAdmins.js — moderno):
 *   GET    /api/admin/admins
 *   POST   /api/admin/admins
 *   PUT    /api/admin/admins/:id
 *   DELETE /api/admin/admins/:id
 *
 * verifyAdmin + requirePermission("admins_manage") são aplicados no mount
 * (adminRoutes.js), então o teste os adiciona manualmente.
 */

"use strict";

const request = require("supertest");
const express = require("express");

const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const BCRYPT_PATH = require.resolve("bcrypt");
const ADMIN_LOGS_PATH = require.resolve("../../services/adminLogs");
const REPO_PATH = require.resolve("../../repositories/adminAdminsRepository");
const ROUTER_PATH = require.resolve("../../routes/admin/adminAdmins");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/admin/admins";

function setup({ adminUser = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  const logMock = { logAdminAction: jest.fn().mockResolvedValue() };
  const bcryptMock = {
    hash: jest.fn().mockResolvedValue("$hashed$"),
    compare: jest.fn().mockResolvedValue(true),
  };
  const repoMock = {
    findAll: jest.fn(),
    findRoleBySlug: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
  };

  jest.doMock(BCRYPT_PATH, () => bcryptMock);
  jest.doMock(ADMIN_LOGS_PATH, () => logMock);
  jest.doMock(REPO_PATH, () => repoMock);

  jest.doMock(VERIFY_ADMIN_PATH, () =>
    jest.fn((req, res, next) => {
      if (!adminUser) {
        return res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Não autenticado." });
      }
      req.admin = adminUser;
      return next();
    })
  );

  const verifyAdmin = require(VERIFY_ADMIN_PATH);
  const requirePermission = require("../../middleware/requirePermission");
  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);

  const app = express();
  app.use(express.json());
  app.use(MOUNT, verifyAdmin, requirePermission("admins_manage"), router);
  app.use(errorHandler);

  return { app, repoMock, logMock, bcryptMock };
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("adminAdmins — auth guard (verifyAdmin)", () => {
  test("GET / sem auth → 401 e não consulta o banco", async () => {
    const { app, repoMock } = setup({ adminUser: null });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(repoMock.findAll).not.toHaveBeenCalled();
  });

  test("DELETE /:id sem auth → 401", async () => {
    const { app, repoMock } = setup({ adminUser: null });
    const res = await request(app).delete(`${MOUNT}/5`);
    expect(res.status).toBe(401);
    expect(repoMock.findById).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Permission guard
// ---------------------------------------------------------------------------

describe("adminAdmins — permission guard (requirePermission)", () => {
  test("GET / sem permissão admins_manage → 403 Forbidden", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 2, role: "operador", permissions: [] },
    });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(403);
    expect(repoMock.findAll).not.toHaveBeenCalled();
  });

  test("POST / sem permissão admins_manage → 403", async () => {
    const { app } = setup({
      adminUser: { id: 2, role: "operador", permissions: [] },
    });
    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "a@b.com", senha: "123456", role: "operador",
    });
    expect(res.status).toBe(403);
  });

  test("DELETE /:id sem permissão admins_manage → 403", async () => {
    const { app } = setup({
      adminUser: { id: 2, role: "operador", permissions: [] },
    });
    const res = await request(app).delete(`${MOUNT}/5`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /api/admin/admins", () => {
  test("200: retorna admins em { ok, data }", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    const rows = [
      { id: 1, nome: "Master", email: "m@k.com", role: "master", ativo: 1 },
      { id: 2, nome: "Op", email: "op@k.com", role: "operador", ativo: 1 },
    ];
    repoMock.findAll.mockResolvedValue(rows);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ role: "master" });
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findAll.mockRejectedValue(new Error("db"));

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe("POST /api/admin/admins", () => {
  test("400: campos obrigatórios ausentes → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    const res = await request(app).post(MOUNT).send({ nome: "Novo" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.findRoleBySlug).not.toHaveBeenCalled();
  });

  test("400: role inválido → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findRoleBySlug.mockResolvedValue(null);

    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "n@t.com", senha: "123456", role: "inexistente",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Role inválido/);
  });

  test("409: email já cadastrado → CONFLICT", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findRoleBySlug.mockResolvedValue({ id: 1 });
    repoMock.findByEmail.mockResolvedValue({ id: 99 });

    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "dup@k.com", senha: "123456", role: "operador",
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  test("201: cria admin com sucesso — role normalizado via Zod", async () => {
    const { app, repoMock, logMock } = setup({
      adminUser: { id: 1, role: "master", permissions: [] },
    });
    repoMock.findRoleBySlug.mockResolvedValue({ id: 5 });
    repoMock.findByEmail.mockResolvedValue(null);
    repoMock.insert.mockResolvedValue(88);

    const res = await request(app).post(MOUNT).send({
      nome: "João Operador",
      email: "joao@kavita.com",
      senha: "minha_senha",
      role: "OPERADOR",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 88,
      nome: "João Operador",
      email: "joao@kavita.com",
      role: "operador",
      ativo: 1,
    });
    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "criar_admin", entidadeId: 88 })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /:id
// ---------------------------------------------------------------------------

describe("PUT /api/admin/admins/:id", () => {
  test("400: body sem role e sem ativo → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    const res = await request(app).put(`${MOUNT}/5`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  test("200: atualiza role com sucesso", async () => {
    const { app, repoMock, logMock } = setup({
      adminUser: { id: 1, role: "master", permissions: [] },
    });
    repoMock.findRoleBySlug.mockResolvedValue({ id: 3 });
    repoMock.update.mockResolvedValue(1);

    const res = await request(app).put(`${MOUNT}/10`).send({ role: "gerente" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, message: expect.stringContaining("atualizado") });
    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "atualizar_admin" })
    );
  });

  test("404: admin não encontrado", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findRoleBySlug.mockResolvedValue({ id: 3 });
    repoMock.update.mockResolvedValue(0);

    const res = await request(app).put(`${MOUNT}/999`).send({ role: "operador" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/admins/:id", () => {
  test("404: admin não encontrado → NOT_FOUND", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findById.mockResolvedValue(null);

    const res = await request(app).delete(`${MOUNT}/888`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("[REGRA CRÍTICA] 400: admin não pode remover a si mesmo", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 5, role: "master", permissions: [] },
    });
    repoMock.findById.mockResolvedValue({ id: 5, role: "operador" });

    const res = await request(app).delete(`${MOUNT}/5`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(res.body.message).toMatch(/si mesmo/i);
    expect(repoMock.deleteById).not.toHaveBeenCalled();
  });

  test("[REGRA CRÍTICA] 400: admin master não pode ser removido", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findById.mockResolvedValue({ id: 1, role: "master" });

    const res = await request(app).delete(`${MOUNT}/1`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/master/i);
    expect(repoMock.deleteById).not.toHaveBeenCalled();
  });

  test("204: remove admin com sucesso e registra log", async () => {
    const { app, repoMock, logMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findById.mockResolvedValue({ id: 10, role: "operador" });
    repoMock.deleteById.mockResolvedValue();

    const res = await request(app).delete(`${MOUNT}/10`);
    expect(res.status).toBe(204);
    expect(repoMock.deleteById).toHaveBeenCalledWith(10);
    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "remover_admin", entidadeId: 10 })
    );
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, repoMock } = setup({
      adminUser: { id: 999, role: "master", permissions: [] },
    });
    repoMock.findById.mockRejectedValue(new Error("db"));

    const res = await request(app).delete(`${MOUNT}/5`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
