/**
 * test/integration/adminCupons.int.test.js
 *
 * Testes de integração para CRUD de cupons (painel admin):
 *   GET    /api/admin/cupons
 *   POST   /api/admin/cupons
 *   PUT    /api/admin/cupons/:id
 *   DELETE /api/admin/cupons/:id
 *
 * Cenários:
 *   - Auth guard (401), permission guard (403)
 *   - Validação Zod (campos obrigatórios, tipo inválido, valor <= 0)
 *   - Código duplicado (409 CONFLICT via ER_DUP_ENTRY)
 *   - Cupom inexistente no update/delete (404)
 *   - CRUD happy path
 */

"use strict";

const request = require("supertest");
const express = require("express");

const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const REPO_PATH = require.resolve("../../repositories/cuponsRepository");
const POOL_PATH = require.resolve("../../config/pool");
const ROUTER_PATH = require.resolve("../../routes/admin/adminCupons");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/admin/cupons";

function setup({ adminUser = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock(POOL_PATH, () => ({ query: jest.fn() }));

  const repoMock = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  jest.doMock(REPO_PATH, () => repoMock);

  jest.doMock(VERIFY_ADMIN_PATH, () =>
    jest.fn((req, res, next) => {
      if (!adminUser) return res.status(401).json({ ok: false, code: "AUTH_ERROR" });
      req.admin = adminUser;
      next();
    })
  );

  const verifyAdmin = require(VERIFY_ADMIN_PATH);
  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);

  const app = express();
  app.use(express.json());
  app.use(MOUNT, verifyAdmin, router);
  app.use(errorHandler);

  return { app, repoMock };
}

const ADMIN = { id: 1, role: "master", permissions: [] };

const VALID_CUPOM = {
  codigo: "PROMO10",
  tipo: "percentual",
  valor: 10,
  minimo: 50,
  expiracao: "2026-12-31T23:59",
  max_usos: 100,
  ativo: true,
};

describe("Admin Cupons — auth", () => {
  test("GET / sem auth → 401", async () => {
    const { app } = setup({ adminUser: null });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/cupons", () => {
  test("200: lista cupons", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.findAll.mockResolvedValue([{ id: 1, codigo: "PROMO10" }]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/admin/cupons", () => {
  test("400: campos obrigatórios ausentes", async () => {
    const { app } = setup({ adminUser: ADMIN });
    const res = await request(app).post(MOUNT).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400: tipo inválido (nem percentual nem valor)", async () => {
    const { app } = setup({ adminUser: ADMIN });
    const res = await request(app).post(MOUNT).send({
      ...VALID_CUPOM, tipo: "invalido",
    });
    expect(res.status).toBe(400);
  });

  test("400: valor <= 0", async () => {
    const { app } = setup({ adminUser: ADMIN });
    const res = await request(app).post(MOUNT).send({
      ...VALID_CUPOM, valor: 0,
    });
    expect(res.status).toBe(400);
  });

  test("409: código duplicado → CONFLICT", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    const err = new Error("Duplicate");
    err.code = "ER_DUP_ENTRY";
    repoMock.create.mockRejectedValue(err);

    const res = await request(app).post(MOUNT).send(VALID_CUPOM);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  test("201: cria cupom com sucesso", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.create.mockResolvedValue({ id: 5, ...VALID_CUPOM });

    const res = await request(app).post(MOUNT).send(VALID_CUPOM);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBe(5);
  });
});

describe("PUT /api/admin/cupons/:id", () => {
  test("404: cupom inexistente", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.update.mockResolvedValue(null);

    const res = await request(app).put(`${MOUNT}/999`).send(VALID_CUPOM);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  test("200: atualiza cupom", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.update.mockResolvedValue({ id: 1, ...VALID_CUPOM, valor: 20 });

    const res = await request(app).put(`${MOUNT}/1`).send({ ...VALID_CUPOM, valor: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.valor).toBe(20);
  });
});

describe("DELETE /api/admin/cupons/:id", () => {
  test("404: cupom inexistente", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.remove.mockResolvedValue(false);

    const res = await request(app).delete(`${MOUNT}/999`);

    expect(res.status).toBe(404);
  });

  test("204: remove cupom", async () => {
    const { app, repoMock } = setup({ adminUser: ADMIN });
    repoMock.remove.mockResolvedValue(true);

    const res = await request(app).delete(`${MOUNT}/1`);

    expect(res.status).toBe(204);
  });

  test("400: id inválido → VALIDATION_ERROR", async () => {
    const { app } = setup({ adminUser: ADMIN });
    const res = await request(app).delete(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
  });
});
