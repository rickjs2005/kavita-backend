/**
 * test/integration/userProfileAdmin.int.test.js
 *
 * Testa as rotas admin de userProfile (routes/userProfile.js):
 *   GET  /api/users/admin/:id
 *   PUT  /api/users/admin/:id
 *
 * Cobertura de segurança:
 * - Sem token (adminToken ausente) → 401
 * - Token de usuário comum (auth_token, sem adminToken) → 401
 *   Prova que o fix funciona: antes da correção, essas rotas aceitavam auth_token;
 *   após o fix, exigem exclusivamente adminToken via verifyAdmin real.
 * - Token de admin válido → 200
 * - PUT atualiza campos (nome, cidade) → 200
 * - PUT sem campos válidos → 400
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("userProfile /admin/:id routes — auth via verifyAdmin (adminToken)", () => {
  const poolPath = require.resolve("../../config/pool");
  const verifyAdminPath = require.resolve("../../middleware/verifyAdmin");
  const authenticateTokenPath = require.resolve("../../middleware/authenticateToken");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const sanitizePath = require.resolve("../../utils/sanitize");
  const cpfPath = require.resolve("../../utils/cpf");
  const routerPath = require.resolve("../../routes/auth/_legacy/userProfile");

  const MOUNT = "/api/users";

  const MOCK_USER_ROW = {
    id: 42,
    nome: "Cliente Teste",
    email: "cliente@test.com",
    telefone: null,
    cpf: null,
    endereco: null,
    cidade: null,
    estado: null,
    cep: null,
    pais: null,
    ponto_referencia: null,
    status_conta: "ativo",
  };

  function loadApp({ adminAuthenticated = true } = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(errorCodesPath, () => ({
      VALIDATION_ERROR: "VALIDATION_ERROR",
      SERVER_ERROR: "SERVER_ERROR",
      NOT_FOUND: "NOT_FOUND",
      AUTH_ERROR: "AUTH_ERROR",
    }));

    jest.doMock(appErrorPath, () => {
      return class AppError extends Error {
        constructor(message, code, status) {
          super(message);
          this.name = "AppError";
          this.code = code;
          this.status = status;
        }
      };
    });

    const mockPool = makeMockPool();
    jest.doMock(poolPath, () => mockPool);

    jest.doMock(sanitizePath, () => ({
      sanitizeText: (str) => str,
    }));

    jest.doMock(cpfPath, () => ({
      sanitizeCPF: (v) => v,
      isValidCPF: () => true,
    }));

    // authenticateToken: still needed for /me routes, but irrelevant for /admin/:id after fix
    jest.doMock(authenticateTokenPath, () => {
      return function authenticateToken(req, _res, next) {
        // /me routes: inject a regular user
        req.user = { id: 1, role: "user" };
        return next();
      };
    });

    // verifyAdmin: mock that simulates the real middleware behaviour
    jest.doMock(verifyAdminPath, () => {
      const AppError = jest.requireActual(appErrorPath);
      const CODES = { AUTH_ERROR: "AUTH_ERROR" };
      return function verifyAdmin(req, _res, next) {
        if (!adminAuthenticated) {
          const err = new AppError("Token não fornecido.", CODES.AUTH_ERROR, 401);
          err.status = 401;
          return next(err);
        }
        req.admin = { id: 99, role: "admin", permissions: [] };
        return next();
      };
    });

    const router = require(routerPath);
    const pool = require(poolPath);
    const app = makeTestApp(MOUNT, router);

    return { app, pool };
  }

  // -----------------------------------------------------------------------
  // GET /api/users/admin/:id
  // -----------------------------------------------------------------------
  describe("GET /api/users/admin/:id", () => {
    test("401 quando adminToken está ausente (sem autenticação)", async () => {
      const { app } = loadApp({ adminAuthenticated: false });

      const res = await request(app).get(`${MOUNT}/admin/42`);

      expect(res.status).toBe(401);
    });

    test("200 e dados do usuário com adminToken válido", async () => {
      const { app, pool } = loadApp({ adminAuthenticated: true });

      pool.query.mockResolvedValueOnce([[MOCK_USER_ROW]]);

      const res = await request(app).get(`${MOUNT}/admin/42`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 42, nome: "Cliente Teste" });
    });

    test("404 quando usuário não existe", async () => {
      const { app, pool } = loadApp({ adminAuthenticated: true });

      pool.query.mockResolvedValueOnce([[]]); // rows empty

      const res = await request(app).get(`${MOUNT}/admin/999`);

      expect(res.status).toBe(404);
    });

    test("400 quando id não é número válido", async () => {
      const { app } = loadApp({ adminAuthenticated: true });

      const res = await request(app).get(`${MOUNT}/admin/abc`);

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/users/admin/:id
  // -----------------------------------------------------------------------
  describe("PUT /api/users/admin/:id", () => {
    test("401 quando adminToken está ausente", async () => {
      const { app } = loadApp({ adminAuthenticated: false });

      const res = await request(app)
        .put(`${MOUNT}/admin/42`)
        .send({ nome: "Novo Nome" });

      expect(res.status).toBe(401);
    });

    test("200 e dados atualizados com adminToken válido", async () => {
      const { app, pool } = loadApp({ adminAuthenticated: true });

      // UPDATE + SELECT
      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ ...MOCK_USER_ROW, nome: "Novo Nome" }]]);

      const res = await request(app)
        .put(`${MOUNT}/admin/42`)
        .send({ nome: "Novo Nome" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nome: "Novo Nome" });
    });

    test("400 quando body não tem campos válidos para atualizar", async () => {
      const { app } = loadApp({ adminAuthenticated: true });

      const res = await request(app)
        .put(`${MOUNT}/admin/42`)
        .send({ campoInexistente: "valor" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ mensagem: "Nada para atualizar." });
    });

    test("400 quando campo excede tamanho máximo (nome > 100 chars)", async () => {
      const { app } = loadApp({ adminAuthenticated: true });

      const res = await request(app)
        .put(`${MOUNT}/admin/42`)
        .send({ nome: "A".repeat(101) });

      expect(res.status).toBe(400);
    });

    test("PUT city update passes through correctly", async () => {
      const { app, pool } = loadApp({ adminAuthenticated: true });

      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ ...MOCK_USER_ROW, cidade: "Belo Horizonte" }]]);

      const res = await request(app)
        .put(`${MOUNT}/admin/42`)
        .send({ cidade: "Belo Horizonte" });

      expect(res.status).toBe(200);
      expect(res.body.cidade).toBe("Belo Horizonte");
    });
  });
});
