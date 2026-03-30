/**
 * test/integration/publicPromocoes.int.test.js
 *
 * Rotas testadas (routes/public/publicPromocoes.js):
 *   GET /api/public/promocoes
 *   GET /api/public/promocoes/:productId
 *
 * Padrão:
 *   - Sem MySQL real: pool mockado via jest.doMock
 *   - Controller mockado via jest.doMock (testa wiring de rota + validate middleware)
 *   - makeTestApp(mountPath, router) de test/testUtils.js
 *   - AAA (Arrange → Act → Assert)
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Public Promocoes routes (routes/public/publicPromocoes.js)", () => {
  const originalEnv = process.env;
  const MOUNT_PATH = "/api/public/promocoes";

  class FakeAppError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.name = "AppError";
      this.code = code;
      this.status = status;
      if (details !== undefined) this.details = details;
    }
  }

  let app;
  let mockCtrl;
  let mockPool;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "test" };

    mockPool = { query: jest.fn() };

    mockCtrl = {
      listPromocoes: jest.fn((_req, res) =>
        res.status(200).json({ ok: true, data: [{ id: 1 }] })
      ),
      getPromocao: jest.fn((req, res) =>
        res.status(200).json({ ok: true, data: { id: req.params.productId } })
      ),
    };

    const poolPath = require.resolve("../../config/pool");
    const appErrorPath = require.resolve("../../errors/AppError");
    const ctrlPath = require.resolve("../../controllers/promocoesPublicController");

    jest.doMock(poolPath, () => mockPool);
    jest.doMock(appErrorPath, () => FakeAppError);
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/public/publicPromocoes");
    app = makeTestApp(MOUNT_PATH, router);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe("GET /", () => {
    test("→ 200, chama listPromocoes", async () => {
      const res = await request(app).get(MOUNT_PATH);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(mockCtrl.listPromocoes).toHaveBeenCalledTimes(1);
    });

    test("parâmetros extras são ignorados (rota sem query schema)", async () => {
      const res = await request(app).get(MOUNT_PATH).query({ foo: "bar" });
      expect(res.status).toBe(200);
      expect(mockCtrl.listPromocoes).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:productId
  // -------------------------------------------------------------------------

  describe("GET /:productId", () => {
    test("ID válido → 200, chama getPromocao", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/5`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockCtrl.getPromocao).toHaveBeenCalledTimes(1);
    });

    test("ID='0' → 400 (falha de validação)", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/0`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(mockCtrl.getPromocao).not.toHaveBeenCalled();
    });

    test("ID='abc' → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/abc`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(mockCtrl.getPromocao).not.toHaveBeenCalled();
    });

    test("ID='-1' → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/-1`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test("ID='1.5' → 400 (decimal não aceito)", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/1.5`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test("erro de validação inclui details.fields", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/0`);
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
      expect(Array.isArray(res.body.details.fields)).toBe(true);
    });
  });
});
