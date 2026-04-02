/**
 * test/unit/controllers/authController.unit.test.js
 *
 * Testes unitários do AuthController — sem Express/Supertest.
 * Foca nas respostas de contrato da API (ok, message) para forgotPassword.
 */

"use strict";

jest.mock("../../../repositories/userRepository");
jest.mock("../../../services/passwordResetTokenService");
jest.mock("../../../services/mailService");
jest.mock("../../../security/accountLockout", () => ({
  assertNotLocked: jest.fn(),
  incrementFailure: jest.fn(),
  resetFailures: jest.fn(),
  syncFromRedis: jest.fn(),
}));

const userRepo = require("../../../repositories/userRepository");
const passwordResetTokens = require("../../../services/passwordResetTokenService");
const { sendResetPasswordEmail } = require("../../../services/mailService");
const AuthController = require("../../../controllers/authController");

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _cookies: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    cookie(name, value) { this._cookies[name] = value; return this; },
    clearCookie(name) { delete this._cookies[name]; return this; },
  };
  return res;
}

function makeNext() {
  return jest.fn();
}

describe("AuthController.forgotPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    passwordResetTokens.generateToken = jest.fn().mockReturnValue("tok123");
    passwordResetTokens.revokeAllForUser = jest.fn().mockResolvedValue();
    passwordResetTokens.storeToken = jest.fn().mockResolvedValue();
    sendResetPasswordEmail.mockResolvedValue();
  });

  test("e-mail não cadastrado — responde { ok: true, message } sem revelar existência", async () => {
    userRepo.findUserByEmail = jest.fn().mockResolvedValue(null);

    const req = { body: { email: "naoexiste@test.com" }, rateLimit: { fail: jest.fn(), reset: jest.fn() } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.forgotPassword(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ok: true,
      message: expect.stringContaining("e-mail"),
    });
    expect(res._body).not.toHaveProperty("mensagem");
  });

  test("e-mail cadastrado — envia email e responde { ok: true, message }", async () => {
    userRepo.findUserByEmail = jest.fn().mockResolvedValue({ id: 42, email: "user@test.com" });

    const req = { body: { email: "user@test.com" }, rateLimit: { fail: jest.fn(), reset: jest.fn() } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.forgotPassword(req, res, next);

    expect(sendResetPasswordEmail).toHaveBeenCalledWith("user@test.com", "tok123");
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ok: true,
      message: expect.stringContaining("e-mail"),
    });
    expect(res._body).not.toHaveProperty("mensagem");
  });

  test("sem email no body — chama next(AppError) com 400", async () => {
    const req = { body: {}, rateLimit: { fail: jest.fn(), reset: jest.fn() } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  test("erro inesperado — chama next(AppError) com 500", async () => {
    userRepo.findUserByEmail = jest.fn().mockRejectedValue(new Error("db down"));

    const req = { body: { email: "x@test.com" }, rateLimit: { fail: jest.fn(), reset: jest.fn() } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(500);
    expect(err.code).toBe("SERVER_ERROR");
  });
});

// =========================================================================
// register
// =========================================================================

describe("AuthController.register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findUserByEmailOrCpf = jest.fn().mockResolvedValue([]);
    userRepo.createUser = jest.fn().mockResolvedValue();
  });

  test("sucesso — 201 com mensagem de conta criada", async () => {
    const req = { body: { nome: "Ana", email: "ana@test.com", senha: "Abc@1234", cpf: "12345678901" } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(201);
    expect(res._body.ok).toBe(true);
    expect(userRepo.createUser).toHaveBeenCalled();
  });

  test("409 — email E cpf já cadastrados", async () => {
    userRepo.findUserByEmailOrCpf.mockResolvedValue([
      { email: "ana@test.com", cpf: "12345678901" },
    ]);

    const req = { body: { nome: "Ana", email: "ana@test.com", senha: "x", cpf: "12345678901" } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.register(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(409);
    expect(next.mock.calls[0][0].message).toContain("E-mail e CPF");
  });

  test("409 — apenas email já cadastrado", async () => {
    userRepo.findUserByEmailOrCpf.mockResolvedValue([
      { email: "ana@test.com", cpf: "99999999999" },
    ]);

    const req = { body: { nome: "Ana", email: "ana@test.com", senha: "x", cpf: "12345678901" } };
    const next = makeNext();

    await AuthController.register(req, makeRes(), next);

    expect(next.mock.calls[0][0].message).toContain("e-mail");
  });

  test("409 — apenas cpf já cadastrado", async () => {
    userRepo.findUserByEmailOrCpf.mockResolvedValue([
      { email: "outro@test.com", cpf: "12345678901" },
    ]);

    const req = { body: { nome: "Ana", email: "ana@test.com", senha: "x", cpf: "12345678901" } };
    const next = makeNext();

    await AuthController.register(req, makeRes(), next);

    expect(next.mock.calls[0][0].message).toContain("CPF");
  });

  test("500 — erro inesperado no createUser", async () => {
    userRepo.createUser.mockRejectedValue(new Error("db"));

    const req = { body: { nome: "Ana", email: "ana@test.com", senha: "x", cpf: "11111111111" } };
    const next = makeNext();

    await AuthController.register(req, makeRes(), next);

    expect(next.mock.calls[0][0].status).toBe(500);
  });
});

// =========================================================================
// resetPassword
// =========================================================================

describe("AuthController.resetPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    passwordResetTokens.findValidToken = jest.fn();
    passwordResetTokens.revokeToken = jest.fn().mockResolvedValue();
    passwordResetTokens.revokeAllForUser = jest.fn().mockResolvedValue();
    userRepo.updatePassword = jest.fn().mockResolvedValue();
  });

  test("sucesso — reseta senha e revoga tokens", async () => {
    passwordResetTokens.findValidToken.mockResolvedValue({ id: 1, user_id: 42 });

    const req = { body: { token: "tok", novaSenha: "Nova@1234" }, rateLimit: { reset: jest.fn(), fail: jest.fn() } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.resetPassword(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._body.ok).toBe(true);
    expect(res._body.message).toContain("Senha redefinida");
    expect(userRepo.updatePassword).toHaveBeenCalled();
    expect(passwordResetTokens.revokeToken).toHaveBeenCalledWith(1);
    expect(passwordResetTokens.revokeAllForUser).toHaveBeenCalledWith(42);
  });

  test("400 — token ausente", async () => {
    const req = { body: { novaSenha: "x" }, rateLimit: { fail: jest.fn() } };
    const next = makeNext();

    await AuthController.resetPassword(req, makeRes(), next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test("400 — novaSenha ausente", async () => {
    const req = { body: { token: "tok" }, rateLimit: { fail: jest.fn() } };
    const next = makeNext();

    await AuthController.resetPassword(req, makeRes(), next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test("401 — token inválido/expirado", async () => {
    passwordResetTokens.findValidToken.mockResolvedValue(null);

    const req = { body: { token: "bad", novaSenha: "x" }, rateLimit: { fail: jest.fn() } };
    const next = makeNext();

    await AuthController.resetPassword(req, makeRes(), next);

    expect(next.mock.calls[0][0].status).toBe(401);
  });

  test("500 — erro inesperado", async () => {
    passwordResetTokens.findValidToken.mockRejectedValue(new Error("db"));

    const req = { body: { token: "tok", novaSenha: "x" }, rateLimit: { fail: jest.fn() } };
    const next = makeNext();

    await AuthController.resetPassword(req, makeRes(), next);

    expect(next.mock.calls[0][0].status).toBe(500);
  });
});

// =========================================================================
// logout
// =========================================================================

describe("AuthController.logout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.incrementTokenVersion = jest.fn().mockResolvedValue();
  });

  test("sucesso — limpa cookie e incrementa tokenVersion", async () => {
    const req = { user: { id: 42 } };
    const res = makeRes();
    const next = makeNext();

    await AuthController.logout(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._body.ok).toBe(true);
    expect(userRepo.incrementTokenVersion).toHaveBeenCalledWith(42);
  });

  test("sem user.id — não incrementa mas ainda responde ok", async () => {
    const req = { user: {} };
    const res = makeRes();
    const next = makeNext();

    await AuthController.logout(req, res, next);

    expect(res._body.ok).toBe(true);
    expect(userRepo.incrementTokenVersion).not.toHaveBeenCalled();
  });
});
