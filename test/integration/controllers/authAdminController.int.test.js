/**
 * test/integration/controllers/authAdminController.int.test.js
 *
 * Controller testado: controllers/admin/authAdminController.js
 *
 * Endpoints montados no router de teste:
 * - POST /api/admin/login              login (público)
 * - POST /api/admin/login/mfa          loginMfa (público)
 * - GET  /api/admin/me                 getMe (requer req.admin injetado via fakeAuth)
 * - POST /api/admin/logout             logout (requer req.admin injetado via fakeAuth)
 *
 * Regras do projeto:
 * - Sem MySQL real: mock de config/pool
 * - Sem bcrypt/jwt reais: mocks das libs
 * - Sem speakeasy instalado: mock com virtual: true
 * - AAA (Arrange → Act → Assert) em todos os testes
 * - jest.resetModules() por carregamento para isolar estado do módulo (mfaChallenges Map)
 * - Sem snapshots
 */

"use strict";

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../../testUtils");

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const ADMIN_ROW = {
  id: 1,
  nome: "Admin Master",
  email: "admin@kavita.com",
  senha: "$2b$10$hashedpassword",
  role: "master",
  role_id: 1,
  mfa_active: 0,
  mfa_secret: null,
  tokenVersion: 0,
};

const ADMIN_ROW_MFA = {
  ...ADMIN_ROW,
  mfa_active: 1,
  mfa_secret: "JBSWY3DPEHPK3PXP",
};

const PERM_ROW = { chave: "admin.logs.view" };

// ─────────────────────────────────────────────
// Helpers de teste
// ─────────────────────────────────────────────

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Carrega o controller com todos os mocks isolados.
 * Retorna o controller e os mocks para inspeção.
 */
function loadController() {
  jest.resetModules();

  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-key",
  };

  const mockPool = { query: jest.fn() };

  const mockBcrypt = {
    compare: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue("mock.jwt.token"),
    decode: jest.fn(),
  };

  const mockLockout = {
    assertNotLocked: jest.fn(),
    incrementFailure: jest.fn().mockResolvedValue(undefined),
    resetFailures: jest.fn().mockResolvedValue(undefined),
    syncFromRedis: jest.fn().mockResolvedValue(undefined),
  };

  const mockAdminLogs = {
    logAdminAction: jest.fn(),
  };

  const mockSpeakeasy = {
    totp: { verify: jest.fn() },
  };

  jest.doMock("../../../config/pool", () => mockPool);
  jest.doMock("bcrypt", () => mockBcrypt);
  jest.doMock("jsonwebtoken", () => mockJwt);
  jest.doMock("../../../security/accountLockout", () => mockLockout);
  jest.doMock("../../../services/adminLogs", () => mockAdminLogs);
  jest.doMock("speakeasy", () => mockSpeakeasy, { virtual: true });

  const controller = require("../../../controllers/admin/authAdminController");

  return {
    controller,
    mockPool,
    mockBcrypt,
    mockJwt,
    mockLockout,
    mockAdminLogs,
    mockSpeakeasy,
  };
}

/**
 * Constrói o router de teste com fakeAuth para rotas protegidas.
 * fakeAuth injeta req.admin quando o header x-test-admin-id está presente.
 */
function buildRouter(controller, { adminId = 1 } = {}) {
  const router = express.Router();

  const fakeAuth = (req, res, next) => {
    const id = req.headers["x-test-admin-id"];
    if (id) {
      req.admin = { id: parseInt(id, 10) };
      next();
    } else {
      res.status(401).json({ message: "Token inválido." });
    }
  };

  router.post("/login", asyncWrap(controller.login));
  router.post("/login/mfa", asyncWrap(controller.loginMfa));
  router.get("/me", fakeAuth, asyncWrap(controller.getMe));
  router.post("/logout", fakeAuth, asyncWrap(controller.logout));

  return router;
}

const MOUNT = "/api/admin";

// ─────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────

describe("authAdminController", () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // POST /login
  // ─────────────────────────────────────────────

  describe("POST /login", () => {
    test("400 — campos obrigatórios ausentes (email)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ senha: "qualquer" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Email e senha são obrigatórios.");
    });

    test("400 — campos obrigatórios ausentes (senha)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Email e senha são obrigatórios.");
    });

    test("429 — conta bloqueada (assertNotLocked lança err.locked)", async () => {
      // Arrange
      const { controller, mockLockout } = loadController();
      const lockedErr = new Error("Conta bloqueada. Tente novamente mais tarde.");
      lockedErr.locked = true;
      mockLockout.assertNotLocked.mockImplementation(() => { throw lockedErr; });

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "senha123" });

      // Assert
      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(/bloqueada/i);
    });

    test("401 — admin não encontrado", async () => {
      // Arrange
      const { controller, mockPool, mockLockout } = loadController();
      mockPool.query.mockResolvedValueOnce([[]]); // findAdminByEmail → empty

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "naoexiste@kavita.com", senha: "senha123" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Credenciais inválidas.");
      expect(mockLockout.incrementFailure).toHaveBeenCalledWith(
        "admin:naoexiste@kavita.com"
      );
    });

    test("401 — senha incorreta", async () => {
      // Arrange
      const { controller, mockPool, mockBcrypt, mockLockout } = loadController();
      mockPool.query.mockResolvedValueOnce([[ADMIN_ROW]]); // findAdminByEmail
      mockBcrypt.compare.mockResolvedValue(false);

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "errada" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Credenciais inválidas.");
      expect(mockLockout.incrementFailure).toHaveBeenCalled();
    });

    test("200 — login com sucesso, sem MFA", async () => {
      // Arrange
      const { controller, mockPool, mockBcrypt, mockJwt, mockLockout, mockAdminLogs } =
        loadController();

      mockPool.query
        .mockResolvedValueOnce([[ADMIN_ROW]])               // findAdminByEmail
        .mockResolvedValueOnce([[PERM_ROW]])                // getAdminPermissions
        .mockResolvedValueOnce([[]]); // updateLastLogin

      mockBcrypt.compare.mockResolvedValue(true);
      mockJwt.sign.mockReturnValue("mock.jwt.token");

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "correta" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Login realizado com sucesso.");
      expect(res.body.data.admin).toMatchObject({
        id: 1,
        email: "admin@kavita.com",
        nome: "Admin Master",
        role: "master",
      });
      expect(res.body.data.admin.permissions).toEqual(["admin.logs.view"]);

      // Cookie HttpOnly deve estar presente
      const cookies = res.headers["set-cookie"] ?? [];
      expect(cookies.some((c) => c.startsWith("adminToken="))).toBe(true);

      // Lockout reset
      expect(mockLockout.resetFailures).toHaveBeenCalledWith(
        "admin:admin@kavita.com"
      );

      // Audit log
      expect(mockAdminLogs.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ acao: "login_sucesso", adminId: 1 })
      );
    });

    test("200 — login com MFA ativo retorna challengeId", async () => {
      // Arrange
      const { controller, mockPool, mockBcrypt } = loadController();

      mockPool.query.mockResolvedValueOnce([[ADMIN_ROW_MFA]]); // findAdminByEmail
      mockBcrypt.compare.mockResolvedValue(true);

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "correta" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(typeof res.body.data.challengeId).toBe("string");
      expect(res.body.data.challengeId).toHaveLength(64); // 32 bytes hex
    });
  });

  // ─────────────────────────────────────────────
  // POST /login/mfa
  // ─────────────────────────────────────────────

  describe("POST /login/mfa", () => {
    test("400 — challengeId ou código ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login/mfa`)
        .send({ challengeId: "abc" }); // sem code

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("challengeId e código são obrigatórios.");
    });

    test("401 — challengeId não existe no Map", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login/mfa`)
        .send({ challengeId: "naoexiste", code: "123456" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Sessão de verificação inválida.");
    });

    test("200 — fluxo completo MFA (login → mfa)", async () => {
      // Arrange: carregar UMA instância compartilhada do controller
      // para que o mfaChallenges Map persista entre os dois requests.
      const {
        controller,
        mockPool,
        mockBcrypt,
        mockJwt,
        mockAdminLogs,
        mockSpeakeasy,
      } = loadController();

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Arrange step 1: login com MFA → gera challengeId
      mockPool.query.mockResolvedValueOnce([[ADMIN_ROW_MFA]]); // findAdminByEmail
      mockBcrypt.compare.mockResolvedValue(true);

      // Act step 1
      const loginRes = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "correta" });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.mfaRequired).toBe(true);
      const { challengeId } = loginRes.body.data;

      // Arrange step 2: completar MFA
      const ADMIN_ROW_NO_MFA_FIELDS = {
        id: ADMIN_ROW.id,
        nome: ADMIN_ROW.nome,
        email: ADMIN_ROW.email,
        role: ADMIN_ROW.role,
        role_id: ADMIN_ROW.role_id,
        tokenVersion: ADMIN_ROW.tokenVersion,
      };
      mockPool.query
        .mockResolvedValueOnce([[ADMIN_ROW_NO_MFA_FIELDS]]) // findAdminById
        .mockResolvedValueOnce([[PERM_ROW]])                 // getAdminPermissions
        .mockResolvedValueOnce([[]]); // updateLastLogin
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      mockJwt.sign.mockReturnValue("mfa.jwt.token");

      // Act step 2
      const mfaRes = await request(app)
        .post(`${MOUNT}/login/mfa`)
        .send({ challengeId, code: "123456" });

      // Assert
      expect(mfaRes.status).toBe(200);
      expect(mfaRes.body.message).toBe("Login realizado com sucesso.");
      expect(mfaRes.body.data.admin).toMatchObject({ id: 1, email: "admin@kavita.com" });

      const cookies = mfaRes.headers["set-cookie"] ?? [];
      expect(cookies.some((c) => c.startsWith("adminToken="))).toBe(true);

      expect(mockAdminLogs.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ acao: "login_mfa_sucesso", adminId: 1 })
      );
    });

    test("401 — código MFA inválido", async () => {
      // Arrange: criar desafio via login
      const { controller, mockPool, mockBcrypt, mockSpeakeasy } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      mockPool.query.mockResolvedValueOnce([[ADMIN_ROW_MFA]]);
      mockBcrypt.compare.mockResolvedValue(true);
      const loginRes = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "correta" });
      const { challengeId } = loginRes.body.data;

      mockSpeakeasy.totp.verify.mockReturnValue(false); // código errado

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login/mfa`)
        .send({ challengeId, code: "000000" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Credenciais inválidas.");
    });

    test("401 — desafio expirado (Date.now avançado)", async () => {
      // Arrange
      const { controller, mockPool, mockBcrypt } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      mockPool.query.mockResolvedValueOnce([[ADMIN_ROW_MFA]]);
      mockBcrypt.compare.mockResolvedValue(true);
      const loginRes = await request(app)
        .post(`${MOUNT}/login`)
        .send({ email: "admin@kavita.com", senha: "correta" });
      const { challengeId } = loginRes.body.data;

      // Avança o tempo além do TTL (5 minutos + 1ms)
      const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
      const realNow = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(realNow + MFA_CHALLENGE_TTL_MS + 1);

      // Act
      const res = await request(app)
        .post(`${MOUNT}/login/mfa`)
        .send({ challengeId, code: "123456" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expirada/i);

      jest.spyOn(Date, "now").mockRestore();
    });
  });

  // ─────────────────────────────────────────────
  // GET /me
  // ─────────────────────────────────────────────

  describe("GET /me", () => {
    test("401 — sem autenticação (fakeAuth rejeita)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act (sem header x-test-admin-id)
      const res = await request(app).get(`${MOUNT}/me`);

      // Assert
      expect(res.status).toBe(401);
    });

    test("404 — admin não encontrado no banco", async () => {
      // Arrange
      const { controller, mockPool } = loadController();
      mockPool.query.mockResolvedValueOnce([[]]); // findAdminById → vazio

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .get(`${MOUNT}/me`)
        .set("x-test-admin-id", "999");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Admin não encontrado");
    });

    test("200 — retorna perfil do admin com permissões", async () => {
      // Arrange
      const { controller, mockPool } = loadController();
      mockPool.query
        .mockResolvedValueOnce([[ADMIN_ROW]])   // findAdminById
        .mockResolvedValueOnce([[PERM_ROW]]);   // getAdminPermissions

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .get(`${MOUNT}/me`)
        .set("x-test-admin-id", "1");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: 1,
        nome: "Admin Master",
        email: "admin@kavita.com",
        role: "master",
        role_id: 1,
      });
      expect(res.body.data.permissions).toEqual(["admin.logs.view"]);
    });
  });

  // ─────────────────────────────────────────────
  // POST /logout
  // ─────────────────────────────────────────────

  describe("POST /logout", () => {
    test("401 — sem autenticação", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act (sem header x-test-admin-id)
      const res = await request(app).post(`${MOUNT}/logout`);

      // Assert
      expect(res.status).toBe(401);
    });

    test("200 — logout com sucesso, limpa cookie e incrementa tokenVersion", async () => {
      // Arrange
      const { controller, mockPool } = loadController();
      mockPool.query.mockResolvedValueOnce([[]]); // incrementTokenVersion

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/logout`)
        .set("x-test-admin-id", "1");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logout realizado com sucesso.");

      // Cookie deve ser limpo (Set-Cookie com expires no passado)
      const cookies = res.headers["set-cookie"] ?? [];
      expect(
        cookies.some(
          (c) => c.startsWith("adminToken=") && c.includes("Expires=")
        )
      ).toBe(true);

      // tokenVersion deve ter sido incrementado
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toMatch(/tokenVersion/i);
      expect(params).toEqual([1]);
    });
  });
});
