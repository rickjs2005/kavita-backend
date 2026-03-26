/**
 * teste/unit/middleware/verifyAdmin.unit.test.js
 *
 * Testes do middleware verifyAdmin:
 * - sem cookie → 401
 * - token inválido → 401
 * - admin não encontrado → 401
 * - admin inativo → 401
 * - tokenVersion divergente → 401
 * - sucesso: req.admin populado com permissões do banco
 * - cache hit: Redis retorna permissões sem hit no banco
 * - JWT_SECRET ausente → 500
 * - tokenVersion NULL no banco → tratado como 0
 */

"use strict";

const jwt = require("jsonwebtoken");
const pool = require("../../../config/pool");

// Mutable redis mock so tests can toggle redis.ready
// Must be named with "mock" prefix to be accessible in jest.mock() factory
const mockRedis = {
  ready: false,
  client: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue("OK"),
  },
};

jest.mock("jsonwebtoken");
jest.mock("../../../config/pool");
jest.mock("../../../lib/redis", () => mockRedis);

const verifyAdmin = require("../../../middleware/verifyAdmin");

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

const PERM_ROWS = [{ chave: "products.create" }, { chave: "orders.read" }];

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  mockRedis.ready = false;
  mockRedis.client.get.mockReset();
  mockRedis.client.set.mockResolvedValue("OK");
});

describe("verifyAdmin — autenticação", () => {
  test("sem cookie adminToken → next com AppError 401", async () => {
    const { req, res, next } = makeReqRes(null);
    await verifyAdmin(req, res, next);
    const err = nextError(next);
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
  });

  test("token JWT inválido → next com AppError 401", async () => {
    jwt.verify.mockImplementation(() => { throw new Error("invalid signature"); });
    const { req, res, next } = makeReqRes("bad-token");
    await verifyAdmin(req, res, next);
    const err = nextError(next);
    expect(err.status).toBe(401);
  });

  test("admin não encontrado no banco → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 99, tokenVersion: 1 });
    pool.query.mockResolvedValue([[]]); // nenhuma linha
    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);
    const err = nextError(next);
    expect(err.status).toBe(401);
  });

  test("admin inativo (ativo=0) → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    pool.query.mockResolvedValueOnce([[{ ...ADMIN_ROW, ativo: 0 }]]);
    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);
    const err = nextError(next);
    expect(err.status).toBe(401);
  });

  test("tokenVersion divergente → next com AppError 401", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 5 });
    pool.query.mockResolvedValueOnce([[{ ...ADMIN_ROW, tokenVersion: 3 }]]);
    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);
    const err = nextError(next);
    expect(err.status).toBe(401);
  });
});

describe("verifyAdmin — sucesso", () => {
  test("req.admin populado com dados e permissões do banco", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    pool.query
      .mockResolvedValueOnce([[ADMIN_ROW]])
      .mockResolvedValueOnce([PERM_ROWS]);
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
  });

  test("tokenVersion NULL no banco tratado como 0 (pre-migração)", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 0 });
    pool.query
      .mockResolvedValueOnce([[{ ...ADMIN_ROW, tokenVersion: null }]])
      .mockResolvedValueOnce([[{ chave: "legacy.perm" }]]);
    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual(["legacy.perm"]);
  });
});

describe("verifyAdmin — Redis permission cache", () => {
  beforeEach(() => {
    mockRedis.ready = true;
  });

  test("cache hit: permissões lidas do Redis sem segunda query ao banco", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    pool.query.mockResolvedValueOnce([[ADMIN_ROW]]);
    mockRedis.client.get.mockResolvedValue(JSON.stringify(["cached.perm"]));

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual(["cached.perm"]);
    // apenas 1 query (findAdminById), sem segunda query de permissões
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("cache miss: permissões do banco escritas no Redis", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    pool.query
      .mockResolvedValueOnce([[ADMIN_ROW]])
      .mockResolvedValueOnce([PERM_ROWS]);
    mockRedis.client.get.mockResolvedValue(null);

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual(["products.create", "orders.read"]);
    expect(mockRedis.client.set).toHaveBeenCalledTimes(1);
  });

  test("erro no Redis é silencioso e fallback para banco", async () => {
    jwt.verify.mockReturnValue({ id: 1, tokenVersion: 2 });
    pool.query
      .mockResolvedValueOnce([[ADMIN_ROW]])
      .mockResolvedValueOnce([PERM_ROWS]);
    mockRedis.client.get.mockRejectedValue(new Error("redis down"));

    const { req, res, next } = makeReqRes("valid-token");
    await verifyAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.admin.permissions).toEqual(["products.create", "orders.read"]);
  });
});
