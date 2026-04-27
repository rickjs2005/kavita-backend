/**
 * test/integration/auth.int.test.js
 *
 * Testes de integração para fluxos de autenticação:
 *   POST /api/login           — login de usuário
 *   POST /api/users/register  — cadastro
 *   POST /api/logout          — logout (revoga token)
 *
 * Cenários:
 *   - Credenciais inválidas (email/senha errados)
 *   - Validação Zod (email inválido, senha curta, CPF inválido)
 *   - Registro com email/CPF duplicados
 *   - Login seta cookie HttpOnly auth_token
 *   - Resposta segura (sem token no body, sem info leak)
 *   - Logout limpa cookie e incrementa tokenVersion
 */

"use strict";

const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const USER_REPO_PATH = require.resolve("../../repositories/userRepository");
const BCRYPT_PATH = require.resolve("bcrypt");
const AUTH_CONFIG_PATH = require.resolve("../../config/auth");
const LOCKOUT_PATH = require.resolve("../../security/accountLockout");
const MAIL_PATH = require.resolve("../../services/mailService");
const RESET_PATH = require.resolve("../../services/passwordResetTokenService");
const AUTH_TOKEN_PATH = require.resolve("../../middleware/authenticateToken");
const RATE_LIMITER_PATH = require.resolve("../../middleware/adaptiveRateLimiter");

function setup({ authenticatedUser = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  const poolMock = { query: jest.fn() };
  jest.doMock(POOL_PATH, () => poolMock);

  const userRepoMock = {
    findUserByEmail: jest.fn(),
    findUserByEmailOrCpf: jest.fn().mockResolvedValue([]),
    createUser: jest.fn().mockResolvedValue(),
    incrementTokenVersion: jest.fn().mockResolvedValue(),
    updatePassword: jest.fn().mockResolvedValue(),
  };
  jest.doMock(USER_REPO_PATH, () => userRepoMock);

  jest.doMock(BCRYPT_PATH, () => ({
    hash: jest.fn().mockResolvedValue("$hashed$"),
    compare: jest.fn().mockResolvedValue(false),
  }));

  jest.doMock(AUTH_CONFIG_PATH, () => ({
    sign: jest.fn(() => "jwt-test-token"),
    verify: jest.fn(),
    secret: "test-secret",
  }));

  jest.doMock(LOCKOUT_PATH, () => ({
    assertNotLocked: jest.fn(),
    incrementFailure: jest.fn().mockResolvedValue(),
    resetFailures: jest.fn().mockResolvedValue(),
    syncFromRedis: jest.fn().mockResolvedValue(),
  }));

  jest.doMock(MAIL_PATH, () => ({
    sendResetPasswordEmail: jest.fn().mockResolvedValue(),
  }));

  jest.doMock(RESET_PATH, () => ({
    generateToken: jest.fn(() => "reset-token-abc"),
    revokeAllForUser: jest.fn().mockResolvedValue(),
    storeToken: jest.fn().mockResolvedValue(),
    findValidToken: jest.fn(),
    revokeToken: jest.fn().mockResolvedValue(),
  }));

  jest.doMock(AUTH_TOKEN_PATH, () =>
    jest.fn((req, res, next) => {
      if (!authenticatedUser) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      req.user = authenticatedUser;
      next();
    })
  );

  // No-op rate limiter
  jest.doMock(RATE_LIMITER_PATH, () =>
    jest.fn(() => (req, _res, next) => {
      req.rateLimit = { fail: jest.fn(), reset: jest.fn() };
      next();
    })
  );

  const loginRouter = require("../../routes/auth/login");
  const registerRouter = require("../../routes/auth/userRegister");
  const authRouter = require("../../routes/auth/authRoutes");
  const errorHandler = require("../../middleware/errorHandler");

  const app = express();
  app.use(express.json());
  app.use("/api/login", loginRouter);
  app.use("/api/users", registerRouter);
  app.use("/api", authRouter);
  app.use(errorHandler);

  return {
    app,
    userRepoMock,
    bcrypt: require(BCRYPT_PATH),
    lockout: require(LOCKOUT_PATH),
    resetTokens: require(RESET_PATH),
  };
}

// =========================================================================
// LOGIN
// =========================================================================

describe("POST /api/login", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => console.error.mockRestore());

  test("400: email ausente → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/login").send({ senha: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400: senha ausente → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/login").send({ email: "user@test.com" });
    expect(res.status).toBe(400);
  });

  test("401: usuário não encontrado → AUTH_ERROR sem info leak", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmail.mockResolvedValue(null);

    const res = await request(app).post("/api/login").send({
      email: "nope@test.com", senha: "wrong123",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_ERROR");
    expect(res.body.message).toBe("Credenciais inválidas.");
    // Não revela se email existe ou não
    expect(res.body.message).not.toContain("email");
    expect(res.body.message).not.toContain("usuário");
  });

  test("401: senha incorreta → AUTH_ERROR + incrementa lockout", async () => {
    const { app, userRepoMock, bcrypt, lockout } = setup();
    userRepoMock.findUserByEmail.mockResolvedValue({
      id: 1, nome: "Rick", email: "r@t.com", senha: "$old$", tokenVersion: 0,
    });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post("/api/login").send({
      email: "r@t.com", senha: "wrong",
    });

    expect(res.status).toBe(401);
    expect(lockout.incrementFailure).toHaveBeenCalled();
  });

  test("200: credenciais válidas → seta cookie HttpOnly + sem token no body", async () => {
    const { app, userRepoMock, bcrypt } = setup();
    userRepoMock.findUserByEmail.mockResolvedValue({
      id: 1, nome: "Rick", email: "r@t.com", senha: "$hashed$", tokenVersion: 0,
    });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post("/api/login").send({
      email: "r@t.com", senha: "correct",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user).toMatchObject({ id: 1, nome: "Rick" });

    // Sem token no body (cookie only)
    expect(res.body.data.token).toBeUndefined();
    expect(res.body.token).toBeUndefined();

    // Cookie HttpOnly setado
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith("auth_token="))).toBe(true);
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
  });

  test("429: conta bloqueada → rejeitado antes de consultar banco", async () => {
    const { app, lockout, userRepoMock } = setup();
    const err = new Error("Conta bloqueada. Tente novamente em 15 minutos.");
    err.locked = true;
    lockout.assertNotLocked.mockImplementation(() => { throw err; });

    const res = await request(app).post("/api/login").send({
      email: "r@t.com", senha: "any",
    });

    expect(res.status).toBe(429);
    expect(userRepoMock.findUserByEmail).not.toHaveBeenCalled();
  });
});

// =========================================================================
// REGISTER
// =========================================================================

describe("POST /api/users/register", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => console.error.mockRestore());

  test("400: campos ausentes → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/users/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400: email inválido → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "invalido", senha: "123456", cpf: "111.444.777-35",
    });
    expect(res.status).toBe(400);
  });

  test("400: senha curta (<6) → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "r@t.com", senha: "12345", cpf: "111.444.777-35",
    });
    expect(res.status).toBe(400);
  });

  test("400: CPF inválido → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "r@t.com", senha: "123456", cpf: "000.000.000-00",
    });
    expect(res.status).toBe(400);
  });

  test("409: email já cadastrado → CONFLICT", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmailOrCpf.mockResolvedValue([
      { email: "r@t.com", cpf: "99999999999" },
    ]);

    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "r@t.com", senha: "12345678", cpf: "111.444.777-35",
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(res.body.message).toContain("e-mail");
  });

  test("409: CPF já cadastrado → CONFLICT", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmailOrCpf.mockResolvedValue([
      { email: "other@t.com", cpf: "11144477735" },
    ]);

    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "new@t.com", senha: "12345678", cpf: "111.444.777-35",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("CPF");
  });

  test("201: registro bem-sucedido", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmailOrCpf.mockResolvedValue([]);

    const res = await request(app).post("/api/users/register").send({
      nome: "Rick", email: "r@t.com", senha: "12345678", cpf: "111.444.777-35",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(userRepoMock.createUser).toHaveBeenCalled();
  });
});

// =========================================================================
// LOGOUT
// =========================================================================

describe("POST /api/logout", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ authenticatedUser: null });
    const res = await request(app).post("/api/logout");
    expect(res.status).toBe(401);
  });

  test("200: logout limpa cookie e incrementa tokenVersion", async () => {
    const { app, userRepoMock } = setup({ authenticatedUser: { id: 7 } });

    const res = await request(app).post("/api/logout");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(userRepoMock.incrementTokenVersion).toHaveBeenCalledWith(7);

    // Cookie deve ser limpo
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith("auth_token="))).toBe(true);
  });
});

// =========================================================================
// FORGOT / RESET PASSWORD
// =========================================================================

describe("POST /api/forgot-password", () => {
  test("200: resposta neutra para email inexistente (sem info leak)", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmail.mockResolvedValue(null);

    const res = await request(app).post("/api/forgot-password").send({ email: "no@t.com" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Mesma mensagem independente de existir ou não
    expect(res.body.message).toContain("e-mail");
  });

  test("200: email existente → envia link e mesma resposta", async () => {
    const { app, userRepoMock } = setup();
    userRepoMock.findUserByEmail.mockResolvedValue({ id: 1, email: "r@t.com" });

    const res = await request(app).post("/api/forgot-password").send({ email: "r@t.com" });

    expect(res.status).toBe(200);
    // Mesma mensagem (não revela se email existe)
    expect(res.body.message).toContain("e-mail");
  });
});

describe("POST /api/reset-password", () => {
  test("400: token ausente → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/reset-password").send({ novaSenha: "newpass123" });
    expect(res.status).toBe(400);
  });

  test("401: token inválido → AUTH_ERROR", async () => {
    const { app, resetTokens } = setup();
    resetTokens.findValidToken.mockResolvedValue(null);

    const res = await request(app).post("/api/reset-password").send({
      token: "invalid-token-12345", novaSenha: "newpass123",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_ERROR");
  });

  test("200: token válido → senha redefinida", async () => {
    const { app, resetTokens } = setup();
    resetTokens.findValidToken.mockResolvedValue({ id: 1, user_id: 7 });

    const res = await request(app).post("/api/reset-password").send({
      token: "valid-token-12345678", novaSenha: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(resetTokens.revokeToken).toHaveBeenCalledWith(1);
    expect(resetTokens.revokeAllForUser).toHaveBeenCalledWith(7);
  });
});
