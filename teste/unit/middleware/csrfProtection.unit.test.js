/**
 * teste/unit/middleware/csrfProtection.unit.test.js
 *
 * Unit tests for middleware/csrfProtection.js
 */

"use strict";

const { validateCSRF } = require("../../../middleware/csrfProtection");

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

  test("returns 403 on POST when cookie token is missing", () => {
    const req = makeReq("POST", undefined, "some-token");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("CSRF");
  });

  test("returns 403 on POST when header token is missing", () => {
    const req = makeReq("POST", "some-token", undefined);
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("returns 403 on POST when tokens do not match", () => {
    const req = makeReq("POST", "token-A", "token-B");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("inválido");
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

  test("returns 403 on DELETE when tokens do not match", () => {
    const req = makeReq("DELETE", "token-X", "token-Y");
    const res = makeRes();
    const next = jest.fn();

    validateCSRF(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
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
