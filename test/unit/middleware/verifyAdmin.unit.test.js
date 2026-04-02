/**
 * test/unit/middleware/verifyAdmin.unit.test.js
 *
 * Testes unitários do middleware verifyAdmin.
 *
 * Estratégia de mock: authAdminService é mockado no nível do módulo.
 * Isso garante que os testes descrevam o contrato entre o middleware e
 * o service — não os internos de queries ou cache do service.
 * Mudanças em authAdminService (ex: adicionar cache a findAdminById)
 * não devem quebrar estes testes.
 *
 * Casos cobertos:
 * - JWT_SECRET ausente → 500
 * - sem cookie adminToken → 401
 * - token JWT inválido → 401
 * - admin não encontrado → 401
 * - admin inativo (ativo=0) → 401
 * - tokenVersion divergente → 401
 * - sucesso: req.admin populado com dados e permissões
 * - tokenVersion NULL no banco → tratado como 0
 * - getAdminPermissions retorna array vazio → req.admin.permissions = []
 * - getAdminPermissions retorna não-array → req.admin.permissions = []
 * - erro no service → 500
 */

"use strict";

const jwt = require("jsonwebtoken");

jest.mock("jsonwebtoken");

// Factory inline: não referencia variáveis externas (regra de hoisting do Jest).
// As referências às funções mockadas são obtidas via require() após o mock.
jest.mock("../../../services/authAdminService", () => ({
  findAdminById: jest.fn(),
  getAdminPermissions: jest.fn(),
}));

const authAdminService = require("../../../services/authAdminService");
const verifyAdmin = require("../../../middleware/verifyAdmin");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReqRes(cookieToken) {
  const req = { cookies: cookieToken ? { adminToken: cookieToken } : {} };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

function nextError(next) {
  return next.mock.calls[0]?.[0];
}

const ADMIN_ROW = {
  id: 1,
  nome: "Admin",
  email: "admin@test.com",
  role: "admin",
  ativo: 1,
  tokenVersion: 2,
  role_id: 10,
};

const PERMISSIONS = ["products.create", "orders.read"];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
});

// ---------------------------------------------------------------------------
// JWT_SECRET ausente
// ---------------------------------------------------------------------------

describe("verifyAdmin — JWT_SECRET ausente", () => {
  test("JWT_SECRET undefined → next com AppError 500", async () => {
    // Recarrega o módulo com JWT_SECRET ausente para capturar o guard
    // da constante SECRET_KEY = process.env.JWT_SECRET no topo do arquivo.
    jest.resetModules();
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    jest.mock("jsonwebtoken");
    jest.mock("../../../services/authAdminService", () => ({
      findAdminById: jest.fn(),
      getAdminPermissions: jest.fn(),
    }));

    const freshVerifyAdmin = require("../../../middleware/verifyAdmin");

    const { req, res, next } = makeReqRes("qualquer-token");
    await freshVerifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err).toBeDefined();
    expect(err.status).toBe(500);
    expect(err.code).toBe("SERVER_ERROR");

    process.env.JWT_SECRET = originalSecret;
  });
});

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

describe("verifyAdmin — autenticação", () => {
  test("sem cookie adminToken → next com AppError 401", async () => {
    const { req, res, next } = makeReqRes(null);
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
    expect(authAdminService.findAdminById).not.toHaveBeenCalled();
  });

  test("token JWT inválido → next com AppError 401", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const { req, res, next } = makeReqRes("bad-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(401);
    expect(authAdminService.findAdminById).not.toHaveBeenCalled();
  });

  test("admin não encontrado → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 99, tokenVersion: 1 });
    authAdminService.findAdminById.mockResolvedValue(null);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(401);
    expect(authAdminService.findAdminById).toHaveBeenCalledWith(99);
    expect(authAdminService.getAdminPermissions).not.toHaveBeenCalled();
  });

  test("admin inativo (ativo=0) → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue({ ...ADMIN_ROW, ativo: 0 });

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(401);
    expect(authAdminService.getAdminPermissions).not.toHaveBeenCalled();
  });

  test("tokenVersion divergente → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 5 });
    authAdminService.findAdminById.mockResolvedValue({ ...ADMIN_ROW, tokenVersion: 3 });

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(401);
    expect(authAdminService.getAdminPermissions).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sucesso
// ---------------------------------------------------------------------------

describe("verifyAdmin — sucesso", () => {
  test("req.admin populado com dados e permissões do service", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue(ADMIN_ROW);
    authAdminService.getAdminPermissions.mockResolvedValue(PERMISSIONS);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith(); // sem erro
    expect(req.admin).toMatchObject({
      id: 1,
      email: "admin@test.com",
      role: "admin",
      role_id: 10,
      permissions: ["products.create", "orders.read"],
    });
    // Confirma que o middleware passa dbVersion ao service (usado como cache key)
    expect(authAdminService.getAdminPermissions).toHaveBeenCalledWith(1, 2);
  });

  test("tokenVersion NULL no banco tratado como 0 (pré-migração)", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 0 });
    authAdminService.findAdminById.mockResolvedValue({ ...ADMIN_ROW, tokenVersion: null });
    authAdminService.getAdminPermissions.mockResolvedValue(["legacy.perm"]);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual(["legacy.perm"]);
    // dbVersion = null ?? 0 = 0; deve chamar getAdminPermissions com 0
    expect(authAdminService.getAdminPermissions).toHaveBeenCalledWith(1, 0);
  });

  test("JWT sem tokenVersion (undefined) tratado como 0 — bate com DB 0", async () => {
    jwt.verify.mockReturnValue({ id: 1 }); // sem tokenVersion
    authAdminService.findAdminById.mockResolvedValue({ ...ADMIN_ROW, tokenVersion: 0 });
    authAdminService.getAdminPermissions.mockResolvedValue(["p1"]);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin).toBeDefined();
  });

  test("getAdminPermissions retorna array vazio → req.admin.permissions = []", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue(ADMIN_ROW);
    authAdminService.getAdminPermissions.mockResolvedValue([]);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual([]);
  });

  test("getAdminPermissions retorna não-array → req.admin.permissions = []", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue(ADMIN_ROW);
    // Simula retorno inesperado do service (ex: bug ou service não inicializado)
    authAdminService.getAdminPermissions.mockResolvedValue(null);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual([]);
  });

  test("role_id undefined no admin → req.admin.role_id = null", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue({ ...ADMIN_ROW, role_id: undefined });
    authAdminService.getAdminPermissions.mockResolvedValue([]);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.role_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Erros inesperados do service
// ---------------------------------------------------------------------------

describe("verifyAdmin — erro no service", () => {
  test("findAdminById lança exceção → next com AppError 500", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockRejectedValue(new Error("DB down"));

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(500);
  });

  test("getAdminPermissions lança exceção → next com AppError 500", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    authAdminService.findAdminById.mockResolvedValue(ADMIN_ROW);
    authAdminService.getAdminPermissions.mockRejectedValue(new Error("cache exploded"));

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(500);
  });
});
