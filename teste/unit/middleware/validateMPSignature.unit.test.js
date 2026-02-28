/**
 * teste/unit/middleware/validateMPSignature.unit.test.js
 *
 * Unit tests para middleware/validateMPSignature.js
 *
 * Testa:
 * - parseSignatureHeader: parsing do header x-signature
 * - buildSignedManifest: construção do manifesto assinado no formato MP
 * - timingSafeEqual: comparação timing-safe de hashes
 * - validateMPSignature (middleware): comportamento completo
 *
 * Sem DB real, sem rede externa. AAA em todos os testes.
 */
"use strict";

const crypto = require("crypto");

const {
  parseSignatureHeader,
  buildSignedManifest,
  timingSafeEqual,
} = require("../../../middleware/validateMPSignature");
const validateMPSignature = require("../../../middleware/validateMPSignature");

// --------------------------------------------------------------------------
// Helpers para criar mocks de req/res/next
// --------------------------------------------------------------------------
function makeReq({ signatureHeader, requestId, body } = {}) {
  const headers = {};
  if (signatureHeader !== undefined) headers["x-signature"] = signatureHeader;
  if (requestId !== undefined) headers["x-request-id"] = requestId;
  return {
    get: (name) => headers[name.toLowerCase()] ?? undefined,
    body: body ?? {},
  };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

// --------------------------------------------------------------------------
// parseSignatureHeader
// --------------------------------------------------------------------------
describe("parseSignatureHeader", () => {
  test("parseia ts e v1 corretamente", () => {
    const result = parseSignatureHeader("ts=1716900265,v1=abc123");
    expect(result).toEqual({ ts: "1716900265", v1: "abc123" });
  });

  test("retorna null para campos ausentes", () => {
    const result = parseSignatureHeader("ts=1716900265");
    expect(result).toEqual({ ts: "1716900265", v1: null });
  });

  test("retorna null quando header é vazio/nulo", () => {
    expect(parseSignatureHeader("")).toEqual({ ts: null, v1: null });
    expect(parseSignatureHeader(null)).toEqual({ ts: null, v1: null });
    expect(parseSignatureHeader(undefined)).toEqual({ ts: null, v1: null });
  });

  test("lida com espaços ao redor dos pares", () => {
    const result = parseSignatureHeader(" ts=111 , v1=aaa ");
    expect(result).toEqual({ ts: "111", v1: "aaa" });
  });
});

// --------------------------------------------------------------------------
// buildSignedManifest
// --------------------------------------------------------------------------
describe("buildSignedManifest", () => {
  test("inclui id, request-id e ts quando todos presentes", () => {
    const manifest = buildSignedManifest({ dataId: "123456", requestId: "req-abc", ts: "1716900265" });
    expect(manifest).toBe("id:123456;request-id:req-abc;ts:1716900265;");
  });

  test("omite id quando ausente", () => {
    const manifest = buildSignedManifest({ requestId: "req-abc", ts: "1716900265" });
    expect(manifest).toBe("request-id:req-abc;ts:1716900265;");
  });

  test("omite request-id quando ausente", () => {
    const manifest = buildSignedManifest({ dataId: "123456", ts: "1716900265" });
    expect(manifest).toBe("id:123456;ts:1716900265;");
  });

  test("apenas ts quando id e request-id ausentes", () => {
    const manifest = buildSignedManifest({ ts: "1716900265" });
    expect(manifest).toBe("ts:1716900265;");
  });

  test("omite id quando é string vazia", () => {
    const manifest = buildSignedManifest({ dataId: "", ts: "100" });
    expect(manifest).toBe("ts:100;");
  });
});

// --------------------------------------------------------------------------
// timingSafeEqual
// --------------------------------------------------------------------------
describe("timingSafeEqual", () => {
  test("retorna true para hashes iguais", () => {
    const hash = "aabbccdd11223344";
    expect(timingSafeEqual(hash, hash)).toBe(true);
  });

  test("retorna false para hashes diferentes do mesmo tamanho", () => {
    expect(timingSafeEqual("aabbccdd11223344", "aabbccdd11223345")).toBe(false);
  });

  test("retorna false para hashes de tamanhos diferentes", () => {
    expect(timingSafeEqual("aabb", "aabbcc")).toBe(false);
  });

  test("retorna false quando input não é hex válido", () => {
    expect(timingSafeEqual("gg", "gg")).toBe(false);
  });

  test("retorna false quando inputs não são strings", () => {
    expect(timingSafeEqual(null, "aabb")).toBe(false);
    expect(timingSafeEqual("aabb", undefined)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// validateMPSignature (middleware)
// --------------------------------------------------------------------------
describe("validateMPSignature middleware", () => {
  const SECRET = "test-webhook-secret";

  /**
   * Gera uma assinatura válida para os parâmetros fornecidos.
   */
  function buildValidSignature({ dataId, requestId, ts }) {
    const manifest = buildSignedManifest({ dataId, requestId, ts });
    const hash = crypto.createHmac("sha256", SECRET).update(manifest).digest("hex");
    return `ts=${ts},v1=${hash}`;
  }

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    delete process.env.MP_WEBHOOK_SECRET;
  });

  test("chama next() quando assinatura é válida", () => {
    // Arrange
    const ts = "1716900265";
    const dataId = "123456";
    const sig = buildValidSignature({ dataId, ts });
    const req = makeReq({ signatureHeader: sig, body: { data: { id: dataId } } });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
    expect(req.mpSignature).toMatchObject({ ts, v1: expect.any(String) });
  });

  test("retorna 401 quando x-signature ausente", () => {
    // Arrange
    const req = makeReq({ body: { data: { id: "123" } } });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ ok: false });
  });

  test("retorna 401 quando formato do x-signature é inválido (sem ts ou v1)", () => {
    // Arrange
    const req = makeReq({ signatureHeader: "invalid-format", body: {} });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("retorna 401 quando a assinatura não bate", () => {
    // Arrange
    const ts = "1716900265";
    const req = makeReq({ signatureHeader: `ts=${ts},v1=deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000`, body: { data: { id: "999" } } });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("inclui x-request-id no manifesto quando presente", () => {
    // Arrange
    const ts = "1716900265";
    const dataId = "777";
    const requestId = "my-req-id";
    const sig = buildValidSignature({ dataId, requestId, ts });
    const req = makeReq({ signatureHeader: sig, requestId, body: { data: { id: dataId } } });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.mpSignature.manifest).toContain(`request-id:${requestId}`);
  });

  test("chama next() quando MP_WEBHOOK_SECRET não está configurado em ambiente não-produção", () => {
    // Arrange
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = "test";
    const req = makeReq({ body: {} });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  test("retorna 500 quando MP_WEBHOOK_SECRET não está configurado em produção", () => {
    // Arrange
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    const req = makeReq({ body: {} });
    const res = makeRes();
    const next = jest.fn();

    // Act
    validateMPSignature(req, res, next);

    // Assert
    process.env.NODE_ENV = "test"; // restaura
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(500);
  });
});
