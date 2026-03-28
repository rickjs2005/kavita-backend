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
