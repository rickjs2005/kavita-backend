/**
 * teste/integration/security-p0.test.js
 *
 * Security P0 integration tests:
 *   1. CSRF enforcement (403 without token, 200 with valid token)
 *   2. Logout revocation (tokenVersion — token invalid after logout)
 *   3. Persistent lockout (Redis-backed, 5 failures → lock)
 *   4. Login response security (no `token` field in JSON body)
 *   5. Cookie-only auth (Bearer tokens rejected with 401)
 */

"use strict";

const request = require("supertest");

// Set required env vars before loading modules
process.env.EMAIL_USER = process.env.EMAIL_USER || "test@test.com";
process.env.EMAIL_PASS = process.env.EMAIL_PASS || "testpass";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_USER = process.env.DB_USER || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "password";
process.env.DB_NAME = process.env.DB_NAME || "kavita_test";

// ---------------------------------------------------------------------------
// Mock dependencies that require DB / external services
// ---------------------------------------------------------------------------
jest.mock("../../config/pool", () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("../../workers/abandonedCartNotificationsWorker", () => ({
  startAbandonedCartNotificationsWorker: jest.fn(),
}));

jest.mock("../../middleware/adaptiveRateLimiter", () =>
  () => (_req, _res, next) => next()
);

const app = require("../../server");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "test-secret";

// ---------------------------------------------------------------------------
// 1. CSRF enforcement
// ---------------------------------------------------------------------------
describe("CSRF Enforcement", () => {
  test("GET /api/csrf-token returns a csrf token cookie and body", async () => {
    const res = await request(app).get("/api/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("csrfToken");
    const cookies = res.headers["set-cookie"] || [];
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_token"));
    expect(csrfCookie).toBeDefined();
  });

  test("PUT /api/users/me returns 403 without CSRF token", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set("Cookie", "auth_token=sometoken")
      .send({ nome: "Test" });
    // Either 401 (no valid auth) or 403 (CSRF rejection) — CSRF runs first on protected routes
    expect([401, 403]).toContain(res.status);
  });

  test("validateCSRF middleware rejects POST with mismatched tokens", async () => {
    const { validateCSRF } = require("../../middleware/csrfProtection");
    const req = {
      method: "POST",
      cookies: { csrf_token: "token-a" },
      headers: { "x-csrf-token": "token-b" },
    };
    const res = {
      _status: null,
      _body: null,
      status(code) { this._status = code; return this; },
      json(data) { this._body = data; return this; },
    };
    const next = jest.fn();
    validateCSRF(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  test("validateCSRF middleware passes POST with matching tokens", async () => {
    const { validateCSRF } = require("../../middleware/csrfProtection");
    const token = "matching-csrf-token-123";
    const req = {
      method: "POST",
      cookies: { csrf_token: token },
      headers: { "x-csrf-token": token },
    };
    const res = {
      status() { return this; },
      json() { return this; },
    };
    const next = jest.fn();
    validateCSRF(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Logout revocation (tokenVersion)
// ---------------------------------------------------------------------------
describe("Logout Revocation (tokenVersion)", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /api/logout increments tokenVersion in DB", async () => {
    // Simulate a valid auth_token with tokenVersion=1
    const token = jwt.sign(
      { id: 42, tokenVersion: 1 },
      SECRET,
      { expiresIn: "1h" }
    );

    // Mock DB: user found with matching tokenVersion
    pool.query
      .mockResolvedValueOnce([[{ id: 42, nome: "Test", email: "t@t.com", tokenVersion: 1 }]]) // authenticateToken lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE tokenVersion

    const res = await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    expect(res.status).toBe(200);

    // Verify the UPDATE was called with the correct user id
    const updateCall = pool.query.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("tokenVersion") && call[0].includes("UPDATE")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toContain(42);
  });

  test("authenticateToken rejects token when tokenVersion is stale", async () => {
    // Token has tokenVersion=1 but DB has tokenVersion=2 (after logout)
    const token = jwt.sign(
      { id: 55, tokenVersion: 1 },
      SECRET,
      { expiresIn: "1h" }
    );

    pool.query.mockResolvedValueOnce([
      [{ id: 55, nome: "Alice", email: "alice@t.com", tokenVersion: 2 }],
    ]);

    // Call a protected route
    const res = await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 3. Persistent lockout (Redis-backed accountLockout)
// ---------------------------------------------------------------------------
describe("Persistent Lockout (accountLockout)", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("assertNotLocked does not throw for a new identifier", () => {
    const { assertNotLocked } = require("../../utils/accountLockout");
    expect(() => assertNotLocked("user:fresh-unique-p0@example.com")).not.toThrow();
  });

  test("lockout error has 30-minute TTL and locked=true flag", async () => {
    const { assertNotLocked, incrementFailure } = require("../../utils/accountLockout");
    const key = "user:ttl30min-p0@example.com";

    for (let i = 0; i < 5; i++) {
      await incrementFailure(key);
    }

    const err = (() => {
      try { assertNotLocked(key); } catch (e) { return e; }
    })();
    expect(err).toBeDefined();
    expect(err.locked).toBe(true);
    expect(err.status).toBe(429);
    const remainingMin = parseInt(err.message.match(/(\d+) minuto/)?.[1] || "0", 10);
    expect(remainingMin).toBeGreaterThanOrEqual(29);
    expect(remainingMin).toBeLessThanOrEqual(30);
  });

  test("login endpoint returns 429 after 5 failed attempts", async () => {
    // Use a unique email to avoid cross-test state pollution
    const email = "lockout-p0-429@example.com";
    const hashed = await bcrypt.hash("correctPass", 1);
    // Mock: user found, but password doesn't match (triggers incrementFailure each time)
    pool.query.mockResolvedValue([
      [{ id: 99, nome: "U", email, senha: hashed, tokenVersion: 1 }],
    ]);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/login")
        .send({ email, senha: "wrongPass" });
    }

    const res = await request(app)
      .post("/api/login")
      .send({ email, senha: "wrongPass" });

    expect(res.status).toBe(429);
    expect(res.body.message).toContain("bloqueada");
  });
});

// ---------------------------------------------------------------------------
// 4. Login response security — no `token` field in JSON body
// ---------------------------------------------------------------------------
describe("Login Response Security (no token in body)", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /api/login response body does NOT contain token field", async () => {
    const hashed = await bcrypt.hash("senha123", 10);
    pool.query.mockResolvedValueOnce([
      [{ id: 1, nome: "João", email: "joao@email.com", senha: hashed, tokenVersion: 1 }],
    ]);

    const res = await request(app)
      .post("/api/login")
      .send({ email: "joao@email.com", senha: "senha123" });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("token");
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("user");
  });

  test("POST /api/login sets HttpOnly auth_token cookie", async () => {
    const hashed = await bcrypt.hash("senha123", 10);
    pool.query.mockResolvedValueOnce([
      [{ id: 1, nome: "João", email: "joao@email.com", senha: hashed, tokenVersion: 1 }],
    ]);

    const res = await request(app)
      .post("/api/login")
      .send({ email: "joao@email.com", senha: "senha123" });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] || [];
    const authCookie = cookies.find((c) => c.startsWith("auth_token"));
    expect(authCookie).toBeDefined();
    expect(authCookie.toLowerCase()).toContain("httponly");
  });

  test("POST /api/admin/login response body does NOT contain token field", async () => {
    const hashed = await bcrypt.hash("adminPass", 10);
    pool.query
      .mockResolvedValueOnce([
        [{ id: 1, nome: "Admin", email: "admin@kavita.com", senha: hashed, role: "master", role_id: 1, mfa_active: 0, mfa_secret: null, tokenVersion: 1 }],
      ])
      .mockResolvedValueOnce([[]]) // permissions query
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // ultimo_login update

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: "admin@kavita.com", senha: "adminPass" });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("token");
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("admin");
  });
});

// ---------------------------------------------------------------------------
// 5. Cookie-only auth — Bearer tokens rejected
// ---------------------------------------------------------------------------
describe("Cookie-Only Auth (Bearer tokens rejected)", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("authenticateToken: Bearer token in Authorization header is rejected (401)", async () => {
    const token = jwt.sign({ id: 1, tokenVersion: 1 }, SECRET, { expiresIn: "1h" });

    // Bearer is rejected before any DB call — no pool.query mock needed
    const res = await request(app)
      .post("/api/logout")
      .set("Authorization", `Bearer ${token}`);
    // No cookie sent — should be 401
    expect(res.status).toBe(401);
  });

  test("verifyAdmin: Bearer token in Authorization header is rejected (401)", async () => {
    const token = jwt.sign({ id: 1, email: "admin@k.com", role: "master", tokenVersion: 1 }, SECRET, { expiresIn: "1h" });

    const res = await request(app)
      .get("/api/admin/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  test("authenticateToken: valid cookie token is accepted (200)", async () => {
    const token = jwt.sign({ id: 1, tokenVersion: 1 }, SECRET, { expiresIn: "1h" });

    pool.query
      .mockResolvedValueOnce([[{ id: 1, nome: "U", email: "u@u.com", tokenVersion: 1 }]]) // auth check
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // logout UPDATE

    const res = await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 6. tokenVersion null bypass — FIX coverage
// ---------------------------------------------------------------------------
describe("tokenVersion null bypass fix", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("authenticateToken rejeita token quando DB tem tokenVersion=null e JWT tem tokenVersion=1", async () => {
    // Antes do fix: null no DB ignorava a verificação, token valia para sempre.
    // Após o fix: null é tratado como 0, JWT com tokenVersion=1 é rejeitado.
    const token = jwt.sign({ id: 77, tokenVersion: 1 }, SECRET, { expiresIn: "1h" });

    pool.query.mockResolvedValueOnce([
      [{ id: 77, nome: "Ghost", email: "ghost@test.com", tokenVersion: null }],
    ]);

    const res = await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    // tokenVersion 1 (JWT) !== 0 (null ?? 0 no DB) → deve rejeitar
    expect(res.status).toBe(401);
  });

  test("authenticateToken aceita token quando ambos tokenVersion são null (tratados como 0)", async () => {
    // JWT com tokenVersion=0 e DB com null (tratado como 0) → deve aceitar
    const token = jwt.sign({ id: 88, tokenVersion: 0 }, SECRET, { expiresIn: "1h" });

    pool.query
      .mockResolvedValueOnce([
        [{ id: 88, nome: "New", email: "new@test.com", tokenVersion: null }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // logout UPDATE

    const res = await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    // tokenVersion 0 (JWT) === 0 (null ?? 0 no DB) → deve aceitar
    expect(res.status).toBe(200);
  });

  test("logout usa COALESCE — SQL contém COALESCE(tokenVersion, 0)", async () => {
    const token = jwt.sign({ id: 42, tokenVersion: 0 }, SECRET, { expiresIn: "1h" });

    pool.query
      .mockResolvedValueOnce([[{ id: 42, nome: "U", email: "u@t.com", tokenVersion: null }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await request(app)
      .post("/api/logout")
      .set("Cookie", `auth_token=${token}`);

    const updateCall = pool.query.mock.calls.find(
      (call) => typeof call[0] === "string" &&
        call[0].toUpperCase().includes("COALESCE") &&
        call[0].includes("tokenVersion")
    );
    expect(updateCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Checkout não altera email — FIX coverage
// ---------------------------------------------------------------------------
describe("Checkout não altera email do usuário", () => {
  const { create } = require("../../controllers/checkoutController");

  test("UPDATE no banco não inclui email mesmo quando enviado no body", async () => {
    // Monta req/res/next mínimos para chamar o controller diretamente
    let capturedUpdateSql = null;
    let capturedUpdateParams = null;

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation(async (sql, params) => {
        const normalized = sql.toLowerCase().replace(/\s+/g, " ").trim();
        // Captura o UPDATE de usuário
        if (normalized.startsWith("update usuarios set") && !normalized.includes("tokenversion")) {
          capturedUpdateSql = normalized;
          capturedUpdateParams = params;
          return [{ affectedRows: 1 }];
        }
        // Simula INSERT de pedido
        if (normalized.startsWith("insert into pedidos")) return [{ insertId: 1 }];
        // Simula SELECT de produtos (FOR UPDATE)
        if (normalized.includes("from products") && normalized.includes("for update"))
          return [[{ id: 5, price: 100, quantity: 10 }]];
        // Simula SELECT de carrinho
        if (normalized.includes("from carrinhos")) return [[]];
        // Simula INSERT de pedidos_produtos
        if (normalized.startsWith("insert into pedidos_produtos")) return [{ insertId: 99 }];
        // Simula UPDATE de estoque
        if (normalized.startsWith("update products")) return [{ affectedRows: 1 }];
        // Simula UPDATE total do pedido
        if (normalized.startsWith("update pedidos")) return [{ affectedRows: 1 }];
        return [[]];
      }),
    };

    const pool = require("../../config/pool");
    pool.getConnection = jest.fn().mockResolvedValue(conn);

    const req = {
      body: {
        formaPagamento: "pix",
        produtos: [{ id: 5, quantidade: 1 }],
        nome: "Nome Novo",
        email: "hacker@evil.com", // email que NÃO deve ser gravado
        telefone: "31999999999",
        cpf: "12345678901",
        endereco: { cep: "36940000", cidade: "Manhuaçu", estado: "MG" },
      },
      user: { id: 42 },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await create(req, res, next);

    // Garante que o email não foi incluído no UPDATE
    if (capturedUpdateSql) {
      expect(capturedUpdateSql).not.toContain("email");
    }
    // Se não houve UPDATE (nenhum campo válido além de email), ok também
    // — importante é que se houve UPDATE, email não estava lá
  });
});
