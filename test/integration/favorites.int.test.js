/**
 * test/integration/favorites.int.test.js
 *
 * Testes de integração para favoritos do usuário:
 *   GET    /api/favorites              — listar
 *   POST   /api/favorites              — adicionar
 *   DELETE /api/favorites/:productId   — remover
 *
 * Cenários:
 *   - Não autenticado → 401
 *   - Payload inválido → 400
 *   - Produto inexistente → 404
 *   - Fluxo feliz CRUD
 */

"use strict";

const request = require("supertest");
const express = require("express");

const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const SVC_PATH = require.resolve("../../services/favoritesService");
const POOL_PATH = require.resolve("../../config/pool");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/favorites");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/favorites";

function setup({ user = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock(POOL_PATH, () => ({ query: jest.fn() }));

  const svcMock = {
    listFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn().mockResolvedValue(),
    removeFavorite: jest.fn().mockResolvedValue(),
  };
  jest.doMock(SVC_PATH, () => svcMock);

  jest.doMock(AUTH_PATH, () =>
    jest.fn((req, res, next) => {
      if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      req.user = user;
      next();
    })
  );

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use(MOUNT, router);
  app.use(errorHandler);

  return { app, svcMock };
}

describe("GET /api/favorites", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(401);
  });

  test("200: lista favoritos do usuário", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });
    svcMock.listFavorites.mockResolvedValue([{ id: 1, name: "P1" }]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(svcMock.listFavorites).toHaveBeenCalledWith(7);
  });
});

describe("POST /api/favorites", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).post(MOUNT).send({ productId: 1 });
    expect(res.status).toBe(401);
  });

  test("400: productId ausente → VALIDATION_ERROR", async () => {
    const { app } = setup({ user: { id: 7 } });
    const res = await request(app).post(MOUNT).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("404: produto não encontrado (service throws)", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });
    const AppError = require("../../errors/AppError");
    svcMock.addFavorite.mockRejectedValue(
      new AppError("Produto não encontrado.", "NOT_FOUND", 404)
    );

    const res = await request(app).post(MOUNT).send({ productId: 999 });

    expect(res.status).toBe(404);
  });

  test("201: adiciona favorito com sucesso", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });

    const res = await request(app).post(MOUNT).send({ productId: 5 });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(svcMock.addFavorite).toHaveBeenCalledWith(7, 5);
  });
});

describe("DELETE /api/favorites/:productId", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).delete(`${MOUNT}/5`);
    expect(res.status).toBe(401);
  });

  test("400: productId inválido", async () => {
    const { app } = setup({ user: { id: 7 } });
    const res = await request(app).delete(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
  });

  test("204: remove favorito com sucesso", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(204);
    expect(svcMock.removeFavorite).toHaveBeenCalledWith(7, 5);
  });
});
