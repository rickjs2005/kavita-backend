/**
 * teste/unit/middleware/validateMPSignature.unit.test.js
 *
 * Unit tests for middleware/validateMPSignature.js
 *
 * Tests:
 * - Returns 401 when x-signature header is absent
 * - Returns 401 when signature format is invalid (missing ts or v1)
 * - Returns 401 when signature is invalid (wrong HMAC)
 * - Calls next() when signature is valid
 * - Attaches req.mpSignature when signature is valid
 * - Returns 200 in production when MP_WEBHOOK_SECRET is not configured
 * - Returns 500 in development when MP_WEBHOOK_SECRET is not configured
 */

"use strict";

const crypto = require("crypto");

// Helper: compute a valid MP signature
function makeSignature({ secret, dataId = "456789", requestId = "", ts = "1234567890" }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return { header: `ts=${ts},v1=${v1}`, ts, v1 };
}

// Helper: build a mock request/response pair
function makeMockReqRes({ signatureHeader, requestId, body } = {}) {
  const req = {
    get: jest.fn((header) => {
      if (header === "x-signature") return signatureHeader || null;
      if (header === "x-request-id") return requestId || null;
      return null;
    }),
    body: body || {},
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe("validateMPSignature middleware", () => {
  const SECRET = "test-secret-key";

  let originalSecret;
  let originalEnv;

  beforeEach(() => {
    originalSecret = process.env.MP_WEBHOOK_SECRET;
    originalEnv = process.env.NODE_ENV;
    process.env.MP_WEBHOOK_SECRET = SECRET;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.MP_WEBHOOK_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  test("401 quando x-signature header está ausente", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const { req, res, next } = makeMockReqRes({ signatureHeader: null });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false });
    expect(next).not.toHaveBeenCalled();
  });

  test("401 quando x-signature não contém ts ou v1", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const { req, res, next } = makeMockReqRes({ signatureHeader: "invalid-format" });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false });
    expect(next).not.toHaveBeenCalled();
  });

  test("401 quando assinatura HMAC é inválida", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const body = { id: 12345, type: "payment", data: { id: "456789" } };
    const { req, res, next } = makeMockReqRes({
      signatureHeader: "ts=1234567890,v1=invalidhashvalue000000000000000000000000000000000000000000000000",
      body,
    });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false });
    expect(next).not.toHaveBeenCalled();
  });

  test("chama next() e define req.mpSignature quando assinatura é válida", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const body = { id: 12345, type: "payment", data: { id: "456789" } };
    const { header, ts, v1 } = makeSignature({ secret: SECRET, dataId: "456789" });

    const { req, res, next } = makeMockReqRes({ signatureHeader: header, body });

    validateMPSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.mpSignature).toMatchObject({ ts, v1, requestId: "" });
    expect(res.status).not.toHaveBeenCalled();
  });

  test("chama next() com x-request-id no manifest", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const body = { id: 12345, type: "payment", data: { id: "111" } };
    const reqId = "req-uuid-123";
    const { header } = makeSignature({ secret: SECRET, dataId: "111", requestId: reqId });

    const { req, res, next } = makeMockReqRes({
      signatureHeader: header,
      requestId: reqId,
      body,
    });

    validateMPSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("401 quando mesmo header válido mas x-request-id diferente (manifest mismatch)", () => {
    const validateMPSignature = require("../../../middleware/validateMPSignature");
    const body = { id: 12345, type: "payment", data: { id: "111" } };
    // signature computed with requestId="correct-id"
    const { header } = makeSignature({ secret: SECRET, dataId: "111", requestId: "correct-id" });

    // but request arrives with a different x-request-id
    const { req, res, next } = makeMockReqRes({
      signatureHeader: header,
      requestId: "wrong-id",
      body,
    });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("200 em produção quando MP_WEBHOOK_SECRET não está configurado", () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    const validateMPSignature = require("../../../middleware/validateMPSignature");

    const { req, res, next } = makeMockReqRes({ signatureHeader: "ts=1,v1=abc" });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  test("500 em development quando MP_WEBHOOK_SECRET não está configurado", () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = "development";
    const validateMPSignature = require("../../../middleware/validateMPSignature");

    const { req, res, next } = makeMockReqRes({ signatureHeader: "ts=1,v1=abc" });

    validateMPSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
