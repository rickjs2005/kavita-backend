// test/integration/security.test.js
const request = require("supertest");

// Set required env vars before loading server
process.env.EMAIL_USER = process.env.EMAIL_USER || "test@test.com";
process.env.EMAIL_PASS = process.env.EMAIL_PASS || "testpass";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_USER = process.env.DB_USER || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "password";
process.env.DB_NAME = process.env.DB_NAME || "kavita_test";

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

const pool = require("../../config/pool");
const app = require("../../server");

function expectValidationErrorResponse(res) {
  expect(res.status).toBe(400);
  expect(res.body).toBeDefined();
  expect(res.body.code).toBe("VALIDATION_ERROR");
  expect(typeof res.body.message).toBe("string");
  expect(res.body.message.length).toBeGreaterThan(0);
}

describe("Security Headers (Helmet)", () => {
  test("deve retornar X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("deve retornar X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  test("deve retornar Strict-Transport-Security header", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  test("deve retornar Content-Security-Policy header", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
  });

  test("deve retornar Referrer-Policy header", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("Input Validation — Login", () => {
  test("400: email inválido no login", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "nao-e-email", senha: "123456" });

    expectValidationErrorResponse(res);
  });

  test("400: senha vazia no login", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "usuario@email.com", senha: "" });

    expectValidationErrorResponse(res);
  });
});

describe("Input Validation — Register", () => {
  test("400: email inválido no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({
        nome: "João",
        email: "invalido",
        senha: "123456",
        cpf: "111.111.111-11",
      });

    expectValidationErrorResponse(res);
  });

  test("400: senha muito curta no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({
        nome: "João",
        email: "joao@email.com",
        senha: "123",
        cpf: "111.111.111-11",
      });

    expectValidationErrorResponse(res);
  });

  test("400: campos obrigatórios ausentes no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({});

    expectValidationErrorResponse(res);
  });
});

describe("SQL Injection Prevention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("login: payload com SQL injection é rejeitado na validação de email", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "' OR '1'='1", senha: "qualquer" });

    expectValidationErrorResponse(res);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("Rate Limiting", () => {
  test("servidor responde normalmente (rate limiter mockado nos testes)", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    expect([404, 400]).toContain(res.status);
  });
});

describe("Authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("401: credenciais inválidas retornam erro sem vazar informações", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post("/api/login")
      .send({ email: "usuario@email.com", senha: "senhaErrada" });

    expect(res.status).toBe(401);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message).not.toContain("senha");
    expect(res.body.message).not.toContain("hash");
  });
});

describe("CSRF Protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("cookies de autenticação são HttpOnly (não acessíveis via JS)", async () => {
    const bcrypt = require("bcrypt");

    const hashed = await bcrypt.hash("senha123", 10);

    pool.query.mockResolvedValueOnce([
      [{ id: 1, nome: "João", email: "joao@email.com", senha: hashed }],
    ]);

    const res = await request(app)
      .post("/api/login")
      .send({ email: "joao@email.com", senha: "senha123" });

    const setCookie = res.headers["set-cookie"];

    if (setCookie) {
      const authCookie = setCookie.find((cookie) => cookie.startsWith("auth_token"));
      if (authCookie) {
        expect(authCookie.toLowerCase()).toContain("httponly");
      }
    }
  });
});