/**
 * test/unit/middleware/csrfProtection.unit.test.js
 *
 * Unit tests for middleware/csrfProtection.js
 */

"use strict";

const { validateCSRF } = require("../../../middleware/csrfProtection");
const AppError = require("../../../errors/AppError");
const ERROR_CODES = require("../../../constants/ErrorCodes");

function makeReq(method, cookieToken, headerToken) {
  return {
    method,
    cookies: cookieToken !== undefined ? { csrf_token: cookieToken } : {},
    headers: headerToken !== undefined ? { "x-csrf-token": headerToken } : {},
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

describe("validateCSRF", () => {
  test("passes GET requests without any token", () => {
    const req = makeReq("GET", undefined, undefined);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test("passes HEAD requests without any token", () => {
    const req = makeReq("HEAD", undefined, undefined);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("passes OPTIONS requests without any token", () => {
    const req = makeReq("OPTIONS", undefined, undefined);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("calls next(AppError 403 FORBIDDEN) on POST when cookie token is missing", () => {
    const req = makeReq("POST", undefined, "some-token");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(err.message).toContain("CSRF");
    expect(res.statusCode).toBeNull();
  });

  test("calls next(AppError 403 FORBIDDEN) on POST when header token is missing", () => {
    const req = makeReq("POST", "some-token", undefined);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(res.statusCode).toBeNull();
  });

  test("calls next(AppError 403 FORBIDDEN) on POST when tokens do not match", () => {
    const req = makeReq("POST", "token-A", "token-B");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(err.message).toContain("inválido");
    expect(res.statusCode).toBeNull();
  });

  test("calls next() on POST when cookie and header tokens match", () => {
    const token = "abc123def456";
    const req = makeReq("POST", token, token);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test("calls next(AppError 403 FORBIDDEN) on DELETE when tokens do not match", () => {
    const req = makeReq("DELETE", "token-X", "token-Y");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(res.statusCode).toBeNull();
  });

  test("calls next() on PUT when cookie and header tokens match", () => {
    const token = "my-secret-csrf-token-xyz";
    const req = makeReq("PUT", token, token);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
