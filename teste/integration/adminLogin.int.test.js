// teste/integration/adminLogin.int.test.js
//
// Testa a rota POST /api/admin/login com foco em anti-enumeração:
// - Email inválido (não encontrado) e senha incorreta devem retornar
//   exatamente a mesma resposta 401 com mensagem genérica.
// - rateLimit.fail() deve ser chamado em qualquer falha de autenticação.

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

jest.mock("../../config/pool", () => ({
  query: jest.fn(),
}));

jest.mock("../../utils/adminLogger", () => jest.fn());

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../testUtils");

const pool = require("../../config/pool");
const router = require("../../routes/adminLogin");

const MOUNT_PATH = "/api/admin";

// Injeta rateLimit mock via middleware antes do router
let rateLimitFailMock;
let rateLimitResetMock;

function buildApp() {
  rateLimitFailMock = jest.fn();
  rateLimitResetMock = jest.fn();

  const baseRouter = express.Router();
  baseRouter.use((req, _res, next) => {
    req.rateLimit = { fail: rateLimitFailMock, reset: rateLimitResetMock };
    next();
  });
  baseRouter.use(router);

  return makeTestApp(MOUNT_PATH, baseRouter);
}

describe("POST /api/admin/login — Anti-Enumeração", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test("400: email e senha ausentes retornam erro de validação", async () => {
    const res = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({});

    expect(res.status).toBe(400);
    expect(rateLimitFailMock).toHaveBeenCalledTimes(1);
  });

  test("401: email não encontrado retorna mensagem genérica (anti-enumeração)", async () => {
    pool.query.mockResolvedValueOnce([[]]); // nenhum admin encontrado

    const res = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({ email: "notexist@kavita.com", senha: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.message).toBe("Email ou senha inválidos.");
    expect(rateLimitFailMock).toHaveBeenCalledTimes(1);
  });

  test("401: senha incorreta retorna mensagem genérica idêntica (anti-enumeração)", async () => {
    const bcrypt = require("bcrypt");
    const hashed = await bcrypt.hash("correctpass", 10);

    pool.query.mockResolvedValueOnce([[
      { id: 1, nome: "Admin", email: "admin@kavita.com", senha: hashed, role: "master", role_id: 1 },
    ]]);

    const res = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({ email: "admin@kavita.com", senha: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.message).toBe("Email ou senha inválidos.");
    expect(rateLimitFailMock).toHaveBeenCalledTimes(1);
  });

  test("respostas de email inválido e senha incorreta são idênticas (sem enumeração)", async () => {
    const bcrypt = require("bcrypt");
    const hashed = await bcrypt.hash("correctpass", 10);

    // Primeira requisição: email não encontrado
    pool.query.mockResolvedValueOnce([[]]); 
    const resNotFound = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({ email: "notexist@kavita.com", senha: "wrongpass" });

    // Segunda requisição: email encontrado, senha errada
    pool.query.mockResolvedValueOnce([[
      { id: 1, nome: "Admin", email: "admin@kavita.com", senha: hashed, role: "master", role_id: 1 },
    ]]);
    const resWrongPass = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({ email: "admin@kavita.com", senha: "wrongpass" });

    expect(resNotFound.status).toBe(resWrongPass.status);
    expect(resNotFound.body.code).toBe(resWrongPass.body.code);
    expect(resNotFound.body.message).toBe(resWrongPass.body.message);
  });

  test("200: login bem-sucedido reseta o rate limit", async () => {
    const bcrypt = require("bcrypt");
    const hashed = await bcrypt.hash("correctpass", 10);

    // Login query
    pool.query.mockResolvedValueOnce([[
      { id: 1, nome: "Admin", email: "admin@kavita.com", senha: hashed, role: "master", role_id: 1 },
    ]]);
    // Permissions query
    pool.query.mockResolvedValueOnce([[{ chave: "admin.logs.view" }]]);
    // Update ultimo_login
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post(`${MOUNT_PATH}/login`)
      .send({ email: "admin@kavita.com", senha: "correctpass" });

    expect(res.status).toBe(200);
    expect(rateLimitResetMock).toHaveBeenCalledTimes(1);
    expect(rateLimitFailMock).not.toHaveBeenCalled();
  });
});
