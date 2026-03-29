/**
 * test/unit/middleware/authenticateToken.unit.test.js
 *
 * Testes unitários do middleware authenticateToken.
 *
 * Estratégia de mock: userRepository é mockado no nível do módulo.
 * Garante que os testes descrevam o contrato entre o middleware e o
 * repository — não os internos de query SQL.
 * Mudanças em userRepository (ex: adicionar cache) não devem quebrar estes testes.
 *
 * authConfig.verify é mockado via jest.mock("jsonwebtoken") — authConfig
 * chama jwt.verify internamente.
 *
 * Casos cobertos:
 * - sem cookie auth_token → 401 UNAUTHORIZED
 * - token JWT inválido (jwt.verify lança) → 401 AUTH_ERROR
 * - token expirado (TokenExpiredError) → 401 AUTH_ERROR, mensagem "expirada"
 * - payload sem id → 401 AUTH_ERROR
 * - usuário não encontrado (findUserById retorna null) → 401 AUTH_ERROR
 * - tokenVersion divergente → 401 AUTH_ERROR
 * - tokenVersion NULL no banco → tratado como 0 (sem regressão)
 * - sucesso: req.user populado com id, nome, email, role
 * - role ausente no payload → default "user"
 * - findUserById chamado com o id do payload
 */

"use strict";

const jwt = require("jsonwebtoken");

jest.mock("jsonwebtoken");

jest.mock("../../../repositories/userRepository", () => ({
  findUserById: jest.fn(),
}));

const userRepository = require("../../../repositories/userRepository");
const authenticateToken = require("../../../middleware/authenticateToken");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(cookieToken) {
  const req = { cookies: cookieToken ? { auth_token: cookieToken } : {} };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

function nextError(next) {
  return next.mock.calls[0]?.[0];
}

const USER_ROW = {
  id: 5,
  nome: "Rick",
  email: "rick@kavita.com",
  tokenVersion: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: jwt.verify succeeds with a valid payload
  jwt.verify.mockReturnValue({ id: USER_ROW.id, tokenVersion: 2, role: "user" });
  userRepository.findUserById.mockResolvedValue(USER_ROW);
});

// ---------------------------------------------------------------------------
// Sem token
// ---------------------------------------------------------------------------

test("sem cookie auth_token → 401 UNAUTHORIZED", async () => {
  const { req, res, next } = makeCtx(null);

  await authenticateToken(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(err.code).toBe("UNAUTHORIZED");
  expect(userRepository.findUserById).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// JWT inválido / expirado
// ---------------------------------------------------------------------------

test("jwt.verify lança erro genérico → 401 AUTH_ERROR, mensagem 'Token inválido'", async () => {
  jwt.verify.mockImplementation(() => { throw new Error("bad token"); });

  const { req, res, next } = makeCtx("qualquer-token");

  await authenticateToken(req, res, next);

  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(err.code).toBe("AUTH_ERROR");
  expect(String(err.message)).toMatch(/Token inválido/i);
  expect(userRepository.findUserById).not.toHaveBeenCalled();
});

test("TokenExpiredError → 401 AUTH_ERROR, mensagem menciona 'expirada'", async () => {
  const expErr = new Error("jwt expired");
  expErr.name = "TokenExpiredError";
  jwt.verify.mockImplementation(() => { throw expErr; });

  const { req, res, next } = makeCtx("expired-token");

  await authenticateToken(req, res, next);

  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(String(err.message)).toMatch(/expirada/i);
  expect(userRepository.findUserById).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Payload sem id
// ---------------------------------------------------------------------------

test("payload sem id → 401 AUTH_ERROR, sem consulta ao banco", async () => {
  jwt.verify.mockReturnValue({ tokenVersion: 1 }); // id ausente

  const { req, res, next } = makeCtx("token-sem-id");

  await authenticateToken(req, res, next);

  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(err.code).toBe("AUTH_ERROR");
  expect(userRepository.findUserById).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Usuário não encontrado
// ---------------------------------------------------------------------------

test("findUserById retorna null → 401 AUTH_ERROR", async () => {
  userRepository.findUserById.mockResolvedValue(null);

  const { req, res, next } = makeCtx("valid-token");

  await authenticateToken(req, res, next);

  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(err.code).toBe("AUTH_ERROR");
  expect(String(err.message)).toMatch(/não encontrado/i);
  expect(userRepository.findUserById).toHaveBeenCalledWith(USER_ROW.id);
});

// ---------------------------------------------------------------------------
// tokenVersion
// ---------------------------------------------------------------------------

test("tokenVersion divergente (JWT=1 vs banco=2) → 401 AUTH_ERROR", async () => {
  jwt.verify.mockReturnValue({ id: USER_ROW.id, tokenVersion: 1, role: "user" });
  userRepository.findUserById.mockResolvedValue({ ...USER_ROW, tokenVersion: 2 });

  const { req, res, next } = makeCtx("stale-token");

  await authenticateToken(req, res, next);

  const err = nextError(next);
  expect(err.status || err.statusCode).toBe(401);
  expect(String(err.message)).toMatch(/inválida/i);
});

test("tokenVersion NULL no banco → tratado como 0, tokenVersion 0 no JWT → sem rejeição", async () => {
  jwt.verify.mockReturnValue({ id: USER_ROW.id, tokenVersion: 0, role: "user" });
  userRepository.findUserById.mockResolvedValue({ ...USER_ROW, tokenVersion: null });

  const { req, res, next } = makeCtx("valid-token");

  await authenticateToken(req, res, next);

  // next chamado sem argumento (ou com undefined) — sem erro
  expect(next).toHaveBeenCalledTimes(1);
  expect(nextError(next)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("sucesso: req.user populado com id, nome, email e role do payload", async () => {
  const { req, res, next } = makeCtx("valid-token");

  await authenticateToken(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(nextError(next)).toBeUndefined();
  expect(req.user).toEqual({
    id: USER_ROW.id,
    nome: USER_ROW.nome,
    email: USER_ROW.email,
    role: "user",
  });
});

test("role ausente no payload → req.user.role = 'user'", async () => {
  jwt.verify.mockReturnValue({ id: USER_ROW.id, tokenVersion: 2 }); // role ausente

  const { req, res, next } = makeCtx("valid-token");

  await authenticateToken(req, res, next);

  expect(req.user.role).toBe("user");
});

test("findUserById é chamado com o id correto do payload", async () => {
  jwt.verify.mockReturnValue({ id: 42, tokenVersion: 2, role: "user" });
  userRepository.findUserById.mockResolvedValue({ ...USER_ROW, id: 42, tokenVersion: 2 });

  const { req, res, next } = makeCtx("valid-token");

  await authenticateToken(req, res, next);

  expect(userRepository.findUserById).toHaveBeenCalledWith(42);
});
