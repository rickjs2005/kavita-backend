/**
 * test/integration/verifyAdmin.int.test.js
 *
 * Testa o middleware verifyAdmin REAL (não mockado) numa rota admin,
 * exercitando JWT → DB lookup → permissões → requirePermission.
 *
 * Cenários de risco real:
 *   - Sem cookie adminToken → 401
 *   - Bearer token no header → 401 (cookie-only)
 *   - JWT válido mas admin inexistente no DB → 401
 *   - Admin inativo → 401
 *   - tokenVersion divergente (logout) → 401
 *   - Sem permissão necessária → 403
 *   - Tudo válido → 200
 */

"use strict";

const jwt = require("jsonwebtoken");
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

const AUTH_ADMIN_SVC_PATH = require.resolve("../../services/authAdminService");
const POOL_PATH = require.resolve("../../config/pool");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");

const JWT_SECRET = "test-jwt-secret-for-verify-admin";

function setup() {
  jest.resetModules();
  jest.clearAllMocks();

  process.env.JWT_SECRET = JWT_SECRET;

  jest.doMock(POOL_PATH, () => ({ query: jest.fn() }));

  const adminSvcMock = {
    findAdminById: jest.fn(),
    getAdminPermissions: jest.fn().mockResolvedValue([]),
  };
  jest.doMock(AUTH_ADMIN_SVC_PATH, () => adminSvcMock);

  // Use the REAL verifyAdmin and requirePermission — not mocked
  const verifyAdmin = require("../../middleware/verifyAdmin");
  const requirePermission = require("../../middleware/requirePermission");
  const { response } = require("../../lib");
  const errorHandler = require(ERROR_HANDLER_PATH);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Test route that requires admin + permission
  app.get(
    "/api/test/admin-only",
    verifyAdmin,
    requirePermission("test.access"),
    (_req, res) => response.ok(res, { reached: true })
  );

  app.use(errorHandler);

  return { app, adminSvcMock };
}

function makeToken(payload, secret = JWT_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: "2h" });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  delete process.env.JWT_SECRET;
});

describe("verifyAdmin — integração real (JWT + DB)", () => {
  test("401: sem cookie adminToken", async () => {
    const { app } = setup();

    const res = await request(app).get("/api/test/admin-only");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(res.body.message).toContain("Token não fornecido");
  });

  test("401: Bearer token no header (não aceita — cookie-only)", async () => {
    const { app } = setup();
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("Token não fornecido");
  });

  test("401: JWT assinado com secret errado", async () => {
    const { app } = setup();
    const token = makeToken({ id: 1, tokenVersion: 0 }, "wrong-secret");

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("inválido");
  });

  test("401: JWT expirado", async () => {
    const { app } = setup();
    const token = jwt.sign({ id: 1, tokenVersion: 0 }, JWT_SECRET, { expiresIn: "-1s" });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(401);
  });

  test("401: admin não encontrado no DB", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue(null);
    const token = makeToken({ id: 999, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("não encontrado");
  });

  test("401: admin inativo (ativo=0)", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue({
      id: 1, email: "a@t.com", nome: "Admin", role: "operador",
      ativo: 0, tokenVersion: 0,
    });
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("inativo");
  });

  test("401: tokenVersion divergente (sessão revogada por logout)", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue({
      id: 1, email: "a@t.com", nome: "Admin", role: "operador",
      ativo: 1, tokenVersion: 2, // DB tem versão 2
    });
    const token = makeToken({ id: 1, tokenVersion: 1 }); // JWT tem versão 1

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("Sessão inválida");
  });

  test("403: admin válido mas SEM permissão necessária", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue({
      id: 1, email: "a@t.com", nome: "Operador", role: "operador",
      ativo: 1, tokenVersion: 0,
    });
    adminSvcMock.getAdminPermissions.mockResolvedValue(["outra.perm"]);
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AUTH_ERROR");
  });

  test("200: admin válido COM permissão → acesso concedido", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue({
      id: 1, email: "a@t.com", nome: "Admin", role: "operador",
      ativo: 1, tokenVersion: 0,
    });
    adminSvcMock.getAdminPermissions.mockResolvedValue(["test.access"]);
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.reached).toBe(true);
  });

  test("200: role 'master' bypassa requirePermission", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockResolvedValue({
      id: 1, email: "a@t.com", nome: "Master", role: "master",
      ativo: 1, tokenVersion: 0,
    });
    adminSvcMock.getAdminPermissions.mockResolvedValue([]); // sem permissão explícita
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(200); // master bypass
    expect(res.body.data.reached).toBe(true);
  });

  test("500: erro no DB durante validação → SERVER_ERROR", async () => {
    const { app, adminSvcMock } = setup();
    adminSvcMock.findAdminById.mockRejectedValue(new Error("connection lost"));
    const token = makeToken({ id: 1, tokenVersion: 0 });

    const res = await request(app)
      .get("/api/test/admin-only")
      .set("Cookie", `adminToken=${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("SERVER_ERROR");
  });
});
