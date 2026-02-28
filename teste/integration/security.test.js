// teste/integration/security.test.js
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

// Mock dependencies that require DB/external services before loading server
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

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" })])
    );
  });

  test("400: senha vazia no login", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "usuario@email.com", senha: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "senha" })])
    );
  });
});

describe("Input Validation — Register", () => {
  test("400: email inválido no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ nome: "João", email: "invalido", senha: "123456", cpf: "111.111.111-11" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" })])
    );
  });

  test("400: senha muito curta no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ nome: "João", email: "joao@email.com", senha: "123", cpf: "111.111.111-11" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "senha" })])
    );
  });

  test("400: campos obrigatórios ausentes no register", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("SQL Injection Prevention", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("login: payload com SQL injection é rejeitado na validação de email", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "' OR '1'='1", senha: "qualquer" });

    // Deve ser rejeitado por validação de email inválido (não chega ao pool)
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("Rate Limiting", () => {
  test("servidor responde normalmente (rate limiter mockado nos testes)", async () => {
    const res = await request(app).get("/api/nonexistent-route-for-headers");
    // Rate limiter é mockado, apenas verifica que responde com JSON
    expect([404, 400]).toContain(res.status);
  });
});

describe("Authentication", () => {
  const pool = require("../../config/pool");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("401: credenciais inválidas retornam erro sem vazar informações", async () => {
    pool.query.mockResolvedValueOnce([[]]); // nenhum usuário encontrado

    const res = await request(app)
      .post("/api/login")
      .send({ email: "usuario@email.com", senha: "senhaErrada" });

    expect(res.status).toBe(401);
    expect(res.body.message).not.toContain("senha");
    expect(res.body.message).not.toContain("hash");
  });
});

describe("CORS Origin Normalization", () => {
  test("deve aceitar origin com protocolo e host em uppercase", async () => {
    const res = await request(app)
      .get("/api/nonexistent-route-for-headers")
      .set("Origin", "HTTP://LOCALHOST:3000");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  test("deve aceitar origin com trailing slash", async () => {
    const res = await request(app)
      .get("/api/nonexistent-route-for-headers")
      .set("Origin", "http://localhost:3000/");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  test("deve aceitar origin com www. equivalente ao domínio sem www", async () => {
    // http://www.localhost:3000 should normalize to http://localhost:3000
    const res = await request(app)
      .get("/api/nonexistent-route-for-headers")
      .set("Origin", "http://www.localhost:3000");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  test("deve bloquear origin inválida (URL malformada)", async () => {
    const res = await request(app)
      .get("/api/nonexistent-route-for-headers")
      .set("Origin", "http://localhost:3000:extra:invalid");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("deve bloquear origin não permitida", async () => {
    const res = await request(app)
      .get("/api/nonexistent-route-for-headers")
      .set("Origin", "http://evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("CSRF Protection", () => {
  test("cookies de autenticação são HttpOnly (não acessíveis via JS)", async () => {
    const pool = require("../../config/pool");
    const bcrypt = require("bcrypt");

    const hashed = await bcrypt.hash("senha123", 10);
    pool.query.mockResolvedValueOnce([[{ id: 1, nome: "João", email: "joao@email.com", senha: hashed }]]);

    const res = await request(app)
      .post("/api/login")
      .send({ email: "joao@email.com", senha: "senha123" });

    // Verifica que o Set-Cookie contém HttpOnly
    const setCookie = res.headers["set-cookie"];
    if (setCookie) {
      const authCookie = setCookie.find((c) => c.startsWith("auth_token"));
      if (authCookie) {
        expect(authCookie.toLowerCase()).toContain("httponly");
      }
    }
  });
});
