/**
 * teste/unit/middleware/routeSpecificRateLimiter.unit.test.js
 *
 * Testes unitários do middleware/routeSpecificRateLimiter.js
 * - Sem dependências externas (banco, rede)
 * - Valida categorização de rotas, bloqueio e janela de tempo
 * - AAA: Arrange → Act → Assert
 */

const createRouteSpecificRateLimiter = require("../../../middleware/routeSpecificRateLimiter");
const {
  routeConfig,
  sensitiveRoutes,
  moderateRoutes,
  getRouteCategory,
} = require("../../../middleware/routeSpecificRateLimiter");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(path, ip = "1.2.3.4") {
  return { path, ip };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
    set(key, value) {
      this._headers[key] = value;
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// getRouteCategory
// ---------------------------------------------------------------------------

describe("getRouteCategory()", () => {
  test.each([
    ["/api/login", "sensitive"],
    ["/api/admin/login", "sensitive"],
    ["/api/users/register", "sensitive"],
    ["/api/users/forgot-password", "sensitive"],
    ["/api/users/reset-password", "sensitive"],
    ["/api/payment/webhook", "sensitive"],
    ["/api/checkout", "moderate"],
    ["/api/checkout/create", "moderate"],
    ["/api/products", "default"],
    ["/api/public/categorias", "default"],
    ["/api/cart", "default"],
    ["/", "default"],
  ])("path '%s' → categoria '%s'", (path, expected) => {
    expect(getRouteCategory(path)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// routeConfig exportado
// ---------------------------------------------------------------------------

describe("routeConfig exportado", () => {
  test("sensitive tem maxAttempts=3, windowMs=15min, blockMs=1h", () => {
    expect(routeConfig.sensitive.maxAttempts).toBe(3);
    expect(routeConfig.sensitive.windowMs).toBe(15 * 60 * 1000);
    expect(routeConfig.sensitive.blockMs).toBe(60 * 60 * 1000);
  });

  test("moderate tem maxAttempts=10, windowMs=1min, blockMs=5min", () => {
    expect(routeConfig.moderate.maxAttempts).toBe(10);
    expect(routeConfig.moderate.windowMs).toBe(60 * 1000);
    expect(routeConfig.moderate.blockMs).toBe(5 * 60 * 1000);
  });

  test("default tem maxAttempts=100, windowMs=1min, blockMs=5min", () => {
    expect(routeConfig.default.maxAttempts).toBe(100);
    expect(routeConfig.default.windowMs).toBe(60 * 1000);
    expect(routeConfig.default.blockMs).toBe(5 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// Middleware: rota default (public)
// ---------------------------------------------------------------------------

describe("middleware - rota default (/api/products)", () => {
  test("primeiros 100 requests passam sem bloqueio", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/products";
    const ip = "10.0.0.1";

    for (let i = 0; i < 100; i++) {
      const req = makeReq(path, ip);
      const res = makeRes();
      const next = jest.fn();
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res._status).toBeNull();
    }
  });

  test("101ª requisição retorna 429 com Retry-After", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/products";
    const ip = "10.0.0.2";
    const next = jest.fn();

    for (let i = 0; i < 100; i++) {
      limiter(makeReq(path, ip), makeRes(), jest.fn());
    }

    const req = makeReq(path, ip);
    const res = makeRes();
    limiter(req, res, next);

    expect(res._status).toBe(429);
    expect(res._body.retryAfter).toBeGreaterThan(0);
    expect(res._headers["Retry-After"]).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Middleware: rota sensível (/api/login)
// ---------------------------------------------------------------------------

describe("middleware - rota sensível (/api/login)", () => {
  test("3 requests passam", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/login";
    const ip = "10.0.1.1";

    for (let i = 0; i < 3; i++) {
      const next = jest.fn();
      limiter(makeReq(path, ip), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  test("4ª requisição retorna 429 com bloqueio de 1h", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/login";
    const ip = "10.0.1.2";

    for (let i = 0; i < 3; i++) {
      limiter(makeReq(path, ip), makeRes(), jest.fn());
    }

    const res = makeRes();
    const next = jest.fn();
    limiter(makeReq(path, ip), res, next);

    expect(res._status).toBe(429);
    // Retry-After deve ser próximo de 1h (3600 s)
    expect(res._body.retryAfter).toBeGreaterThan(3590);
    expect(next).not.toHaveBeenCalled();
  });

  test("após bloqueio, requisição seguinte ainda retorna 429", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/login";
    const ip = "10.0.1.3";

    // Chegar ao bloqueio
    for (let i = 0; i < 4; i++) {
      limiter(makeReq(path, ip), makeRes(), jest.fn());
    }

    // Nova requisição ainda deve estar bloqueada
    const res = makeRes();
    const next = jest.fn();
    limiter(makeReq(path, ip), res, next);

    expect(res._status).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Middleware: rota moderada (/api/checkout)
// ---------------------------------------------------------------------------

describe("middleware - rota moderada (/api/checkout)", () => {
  test("10 requests passam", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/checkout";
    const ip = "10.0.2.1";

    for (let i = 0; i < 10; i++) {
      const next = jest.fn();
      limiter(makeReq(path, ip), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  test("11ª requisição retorna 429 com bloqueio de 5min", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/checkout";
    const ip = "10.0.2.2";

    for (let i = 0; i < 10; i++) {
      limiter(makeReq(path, ip), makeRes(), jest.fn());
    }

    const res = makeRes();
    const next = jest.fn();
    limiter(makeReq(path, ip), res, next);

    expect(res._status).toBe(429);
    // blockMs = 5 * 60 * 1000 → retryAfter ≈ 300
    expect(res._body.retryAfter).toBeGreaterThan(290);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Isolamento por IP
// ---------------------------------------------------------------------------

describe("middleware - isolamento por IP", () => {
  test("bloqueio de um IP não afeta outro IP na mesma rota", () => {
    const limiter = createRouteSpecificRateLimiter();
    const path = "/api/login";

    // IP A: chega ao bloqueio
    const ipA = "192.168.1.1";
    for (let i = 0; i < 4; i++) {
      limiter(makeReq(path, ipA), makeRes(), jest.fn());
    }

    // IP B: primeira requisição deve passar
    const ipB = "192.168.1.2";
    const next = jest.fn();
    const res = makeRes();
    limiter(makeReq(path, ipB), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Isolamento por rota
// ---------------------------------------------------------------------------

describe("middleware - isolamento por rota", () => {
  test("bloqueio em /api/login não afeta /api/users/register (IPs iguais)", () => {
    const limiter = createRouteSpecificRateLimiter();
    const ip = "5.6.7.8";

    // Bloquear /api/login
    for (let i = 0; i < 4; i++) {
      limiter(makeReq("/api/login", ip), makeRes(), jest.fn());
    }

    // /api/users/register deve ainda passar
    const next = jest.fn();
    const res = makeRes();
    limiter(makeReq("/api/users/register", ip), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exportações do módulo
// ---------------------------------------------------------------------------

describe("exportações do módulo", () => {
  test("sensitiveRoutes é um array de RegExp", () => {
    expect(Array.isArray(sensitiveRoutes)).toBe(true);
    sensitiveRoutes.forEach((r) => expect(r).toBeInstanceOf(RegExp));
  });

  test("moderateRoutes é um array de RegExp", () => {
    expect(Array.isArray(moderateRoutes)).toBe(true);
    moderateRoutes.forEach((r) => expect(r).toBeInstanceOf(RegExp));
  });

  test("createRouteSpecificRateLimiter retorna uma função", () => {
    const limiter = createRouteSpecificRateLimiter();
    expect(typeof limiter).toBe("function");
  });
});
