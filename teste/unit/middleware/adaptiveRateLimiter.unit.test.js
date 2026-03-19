/**
 * teste/unit/middleware/adaptiveRateLimiter.unit.test.js
 *
 * Testes do createAdaptiveRateLimiter:
 * - comportamento padrão (Map in-memory)
 * - injeção de store externo (interface compatível com Map)
 * - backwards-compatibility: sem store → usa Map interno
 */

"use strict";

const createAdaptiveRateLimiter = require("../../../middleware/adaptiveRateLimiter");

function makeReqRes() {
  const req = { ip: "1.2.3.4", rateLimit: undefined };
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    set(k, v) { this._headers[k] = v; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe("createAdaptiveRateLimiter", () => {
  test("lança se keyGenerator não for função", () => {
    expect(() => createAdaptiveRateLimiter({ keyGenerator: "nope" })).toThrow(
      "keyGenerator é obrigatório"
    );
  });

  test("chama next() na primeira requisição (nenhum bloqueio)", () => {
    const limiter = createAdaptiveRateLimiter({
      keyGenerator: (req) => req.ip,
      schedule: [0, 60_000],
    });
    const { req, res, next } = makeReqRes();
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  test("bloqueia após fail() com schedule > 0", () => {
    const limiter = createAdaptiveRateLimiter({
      keyGenerator: (req) => req.ip,
      schedule: [0, 60_000, 300_000],
    });

    // primeira requisição — passa
    const { req: r1, res: res1, next: n1 } = makeReqRes();
    limiter(r1, res1, n1);
    expect(n1).toHaveBeenCalled();
    r1.rateLimit.fail(); // simula 1 falha

    // segunda requisição com mesmo IP — deve ser bloqueada
    const { req: r2, res: res2, next: n2 } = makeReqRes();
    limiter(r2, res2, n2);
    expect(res2._status).toBe(429);
    expect(n2).not.toHaveBeenCalled();
  });

  test("reset() limpa o estado de bloqueio", () => {
    const limiter = createAdaptiveRateLimiter({
      keyGenerator: (req) => req.ip,
      schedule: [0, 60_000],
    });

    const { req: r1, res: res1, next: n1 } = makeReqRes();
    limiter(r1, res1, n1);
    r1.rateLimit.fail();
    r1.rateLimit.reset(); // limpa o estado

    // agora deve passar
    const { req: r2, res: res2, next: n2 } = makeReqRes();
    limiter(r2, res2, n2);
    expect(n2).toHaveBeenCalledTimes(1);
    expect(res2._status).toBeNull();
  });

  // ✅ FIX COVERAGE: injeção de store externo
  test("aceita store externo (interface Map) e usa-o para leitura/escrita", () => {
    // Store simulado com rastreamento de chamadas
    const calls = [];
    const innerMap = new Map();
    const mockStore = {
      get: (k) => { calls.push({ op: "get", k }); return innerMap.get(k); },
      set: (k, v) => { calls.push({ op: "set", k }); innerMap.set(k, v); return mockStore; },
      delete: (k) => { calls.push({ op: "delete", k }); return innerMap.delete(k); },
    };

    const limiter = createAdaptiveRateLimiter({
      keyGenerator: (req) => req.ip,
      schedule: [0, 60_000],
      store: mockStore,
    });

    const { req, res, next } = makeReqRes();
    limiter(req, res, next);

    // Deve ter chamado get e set no store externo
    expect(calls.some((c) => c.op === "get")).toBe(true);
    expect(calls.some((c) => c.op === "set")).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("sem store no parâmetro → Map interno (backwards-compatible)", () => {
    // Não deve lançar e deve funcionar normalmente
    const limiter = createAdaptiveRateLimiter({
      keyGenerator: (req) => req.ip,
      schedule: [0],
    });
    const { req, res, next } = makeReqRes();
    expect(() => limiter(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
