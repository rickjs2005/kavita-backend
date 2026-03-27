/**
 * test/integration/userProfile.dataexposure.test.js
 *
 * Verifica que as rotas GET /api/users/me e PUT /api/users/me não expõem
 * campos internos sensíveis (status_conta, senha, tokenVersion) ao usuário.
 *
 * Contexto: antes da correção, PUT /me incluía status_conta no SELECT de
 * retorno enquanto GET /me não incluía — side-channel que permitia ao usuário
 * descobrir se sua conta estava bloqueada chamando PUT /me com qualquer campo.
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

// Campos que NUNCA devem aparecer nas respostas de /me (usuário comum)
const FORBIDDEN_FIELDS = ["senha", "tokenVersion", "status_conta", "mfa_secret"];

// Campos esperados nas respostas de GET /me e PUT /me
const EXPECTED_FIELDS = [
  "id", "nome", "email", "telefone", "cpf",
  "endereco", "cidade", "estado", "cep", "pais", "ponto_referencia",
];

const MOCK_USER_ROW = {
  id: 7,
  nome: "Usuário Teste",
  email: "usuario@test.com",
  telefone: "31999999999",
  cpf: "11111111111",
  endereco: "Rua das Flores, 10",
  cidade: "Belo Horizonte",
  estado: "MG",
  cep: "30140000",
  pais: "Brasil",
  ponto_referencia: null,
};

// -----------------------------------------------------------------------
// Helpers: monta o app isolado com mocks de auth e pool
// -----------------------------------------------------------------------
function loadApp() {
  jest.resetModules();
  jest.clearAllMocks();

  const poolPath    = require.resolve("../../config/pool");
  const authPath    = require.resolve("../../middleware/authenticateToken");
  const appErrPath  = require.resolve("../../errors/AppError");
  const errCodesPath = require.resolve("../../constants/ErrorCodes");
  const sanitizePath = require.resolve("../../utils/sanitize");
  const cpfPath     = require.resolve("../../utils/cpf");
  const routerPath  = require.resolve("../../routes/auth/userProfile");

  jest.doMock(errCodesPath, () => ({
    VALIDATION_ERROR: "VALIDATION_ERROR",
    SERVER_ERROR: "SERVER_ERROR",
    NOT_FOUND: "NOT_FOUND",
    AUTH_ERROR: "AUTH_ERROR",
  }));

  jest.doMock(appErrPath, () =>
    class AppError extends Error {
      constructor(message, code, status) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
      }
    }
  );

  const mockPool = makeMockPool();
  jest.doMock(poolPath, () => mockPool);

  jest.doMock(sanitizePath, () => ({ sanitizeText: (str) => str }));
  jest.doMock(cpfPath, () => ({
    sanitizeCPF: (v) => v,
    isValidCPF: () => true,
  }));

  // authenticateToken: injeta usuário autenticado
  jest.doMock(authPath, () =>
    function authenticateToken(req, _res, next) {
      req.user = { id: 7, tokenVersion: 1 };
      return next();
    }
  );

  const router = require(routerPath);
  const pool = require(poolPath);
  const app = makeTestApp("/api/users", router);

  return { app, pool };
}

// -----------------------------------------------------------------------
// GET /api/users/me — garante ausência de campos sensíveis
// -----------------------------------------------------------------------
describe("GET /api/users/me — sem campos sensíveis", () => {
  test("200 e resposta contém apenas campos públicos (sem status_conta)", async () => {
    const { app, pool } = loadApp();
    pool.query.mockResolvedValueOnce([[MOCK_USER_ROW]]);

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(200);

    // Nenhum campo proibido na resposta
    for (const field of FORBIDDEN_FIELDS) {
      expect(res.body).not.toHaveProperty(field);
    }

    // Campos esperados presentes
    for (const field of EXPECTED_FIELDS) {
      expect(res.body).toHaveProperty(field);
    }
  });

  test("404 quando usuário não existe no banco", async () => {
    const { app, pool } = loadApp();
    pool.query.mockResolvedValueOnce([[]]); // sem linhas

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(404);
  });
});

// -----------------------------------------------------------------------
// PUT /api/users/me — garante ausência de campos sensíveis
// -----------------------------------------------------------------------
describe("PUT /api/users/me — sem campos sensíveis na resposta", () => {
  test("200 e resposta NÃO inclui status_conta após atualização bem-sucedida", async () => {
    const { app, pool } = loadApp();

    // mock: (1) verificação de CPF duplicado não ocorre (nome não é CPF)
    // (2) UPDATE bem-sucedido
    // (3) SELECT de retorno (sem status_conta)
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])         // UPDATE usuarios
      .mockResolvedValueOnce([[{ ...MOCK_USER_ROW, nome: "Novo Nome" }]]); // SELECT retorno

    const res = await request(app)
      .put("/api/users/me")
      .send({ nome: "Novo Nome" });

    expect(res.status).toBe(200);

    // status_conta NÃO deve estar na resposta
    expect(res.body).not.toHaveProperty("status_conta");

    // campos internos nunca expostos
    for (const field of FORBIDDEN_FIELDS) {
      expect(res.body).not.toHaveProperty(field);
    }
  });

  test("campos esperados presentes na resposta do PUT /me", async () => {
    const { app, pool } = loadApp();

    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...MOCK_USER_ROW }]]);

    const res = await request(app)
      .put("/api/users/me")
      .send({ cidade: "São Paulo" });

    expect(res.status).toBe(200);

    for (const field of EXPECTED_FIELDS) {
      expect(res.body).toHaveProperty(field);
    }
  });

  test("GET /me e PUT /me retornam o mesmo conjunto de campos (contratos iguais)", async () => {
    const { app, pool } = loadApp();

    // GET /me
    pool.query.mockResolvedValueOnce([[{ ...MOCK_USER_ROW }]]);
    const getRes = await request(app).get("/api/users/me");
    expect(getRes.status).toBe(200);
    const getKeys = Object.keys(getRes.body).sort();

    // PUT /me — novo loadApp para reset isolado
    jest.resetModules();
    jest.clearAllMocks();
    const { app: app2, pool: pool2 } = loadApp();

    pool2.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...MOCK_USER_ROW }]]);

    const putRes = await request(app2)
      .put("/api/users/me")
      .send({ cidade: "Contagem" });
    expect(putRes.status).toBe(200);
    const putKeys = Object.keys(putRes.body).sort();

    // Os dois contratos devem ser idênticos
    expect(putKeys).toEqual(getKeys);
  });

  test("400 quando nenhum campo válido é enviado", async () => {
    const { app } = loadApp();

    const res = await request(app)
      .put("/api/users/me")
      .send({ campoInexistente: "valor" });

    expect(res.status).toBe(400);
  });
});
