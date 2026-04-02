/**
 * test/integration/adminAdmins.int.test.js
 *
 * Rotas testadas (routes/admin/adminAdmins.js — LEGADO):
 *   GET    /api/admin/admins          (verifyAdmin + requirePermission("admins_manage"))
 *   POST   /api/admin/admins          (verifyAdmin + requirePermission("admins_manage"))
 *   PUT    /api/admin/admins/:id      (verifyAdmin + requirePermission("admins_manage"))
 *   DELETE /api/admin/admins/:id      (verifyAdmin + requirePermission("admins_manage"))
 *
 * Regras de negócio críticas protegidas aqui:
 *   - Admin não pode remover a si mesmo
 *   - Admin master não pode ser removido por ninguém
 *   - Criação exige role válido (SELECT na admin_roles antes de INSERT)
 *   - Email deve ser único (409 em caso de duplicata)
 *
 * Nota sobre o contrato legado:
 *   - GET / → array cru, sem envelope { ok, data }
 *   - POST 201 → payload direto { id, nome, email, role, ativo }
 *   - Erros → { ok: false, code, message }
 *
 * requirePermission: NÃO é mockado — roda lógica real com req.admin controlado.
 * bcrypt: mockado para velocidade (hash real não é o alvo do teste).
 * logAdminAction: mockado (evita side-effect de escrita).
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

const POOL_PATH = require.resolve("../../config/pool");
const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const BCRYPT_PATH = require.resolve("bcrypt");
const ADMIN_LOGS_PATH = require.resolve("../../services/adminLogs");
const ROUTER_PATH = require.resolve("../../routes/admin/adminAdmins");
const MOUNT = "/api/admin/admins";

// ---------------------------------------------------------------------------
// Helpers de setup
// ---------------------------------------------------------------------------

/**
 * Admin master: bypass automático em requirePermission (role "master").
 */
function setupMaster(adminId = 999) {
  jest.resetModules();

  const poolMock = { query: jest.fn() };
  const logMock = { logAdminAction: jest.fn() };
  const bcryptMock = {
    hash: jest.fn().mockResolvedValue("$hashed_password$"),
    compare: jest.fn().mockResolvedValue(true),
  };

  const verifyAdminMock = jest.fn((req, _res, next) => {
    req.admin = { id: adminId, role: "master", permissions: [] };
    return next();
  });

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);
  jest.doMock(BCRYPT_PATH, () => bcryptMock);
  jest.doMock(ADMIN_LOGS_PATH, () => logMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock, verifyAdminMock, logMock };
}

/**
 * Admin sem permissão admins_manage → requirePermission bloqueia com 403.
 */
function setupWithoutPermission() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };
  const logMock = { logAdminAction: jest.fn() };
  const bcryptMock = { hash: jest.fn(), compare: jest.fn() };

  const verifyAdminMock = jest.fn((req, _res, next) => {
    req.admin = { id: 2, role: "operador", permissions: [] }; // sem admins_manage
    return next();
  });

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);
  jest.doMock(BCRYPT_PATH, () => bcryptMock);
  jest.doMock(ADMIN_LOGS_PATH, () => logMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock };
}

/**
 * Sem autenticação: verifyAdmin bloqueia.
 */
function setupBlocked401() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };
  const logMock = { logAdminAction: jest.fn() };
  const bcryptMock = { hash: jest.fn(), compare: jest.fn() };

  const verifyAdminMock = jest.fn((_req, res) =>
    res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Não autenticado." })
  );

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);
  jest.doMock(BCRYPT_PATH, () => bcryptMock);
  jest.doMock(ADMIN_LOGS_PATH, () => logMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock };
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("adminAdmins — auth guard (verifyAdmin)", () => {
  test("GET / sem auth → 401 e não consulta o banco", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("DELETE /:id sem auth → 401", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(401);
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Permission guard — requirePermission("admins_manage")
// ---------------------------------------------------------------------------

describe("adminAdmins — permission guard (requirePermission)", () => {
  test("GET / sem permissão admins_manage → 403 Forbidden", async () => {
    const { app, poolMock } = setupWithoutPermission();

    const res = await request(app).get(MOUNT);

    // requirePermission chama next(AppError) com status 403
    expect(res.status).toBe(403);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("POST / sem permissão admins_manage → 403", async () => {
    const { app, poolMock } = setupWithoutPermission();

    const res = await request(app).post(MOUNT).send({ nome: "Novo", email: "a@b.com", senha: "123456", role: "operador" });

    expect(res.status).toBe(403);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("DELETE /:id sem permissão admins_manage → 403", async () => {
    const { app, poolMock } = setupWithoutPermission();

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(403);
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /api/admin/admins", () => {
  test("200: retorna array de admins (array cru — contrato legado)", async () => {
    const { app, poolMock } = setupMaster();

    const rows = [
      { id: 1, nome: "Master", email: "master@kavita.com", role: "master", ativo: 1 },
      { id: 2, nome: "Operador", email: "op@kavita.com", role: "operador", ativo: 1 },
    ];
    poolMock.query.mockResolvedValueOnce([rows]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ role: "master" });
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupMaster();
    poolMock.query.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe("POST /api/admin/admins", () => {
  test("400: campos obrigatórios ausentes → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, poolMock } = setupMaster();

    const res = await request(app).post(MOUNT).send({ nome: "Novo" }); // falta email, senha, role

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("400: role inválido (não existe em admin_roles) → VALIDATION_ERROR", async () => {
    const { app, poolMock } = setupMaster();
    poolMock.query.mockResolvedValueOnce([[]]); // SELECT admin_roles → vazio

    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "novo@test.com", senha: "senha123", role: "role-inexistente",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringContaining("Role inválido") });
  });

  test("409: email já cadastrado → CONFLICT", async () => {
    const { app, poolMock } = setupMaster();

    poolMock.query
      .mockResolvedValueOnce([[{ id: 1 }]]) // SELECT admin_roles → role existe
      .mockResolvedValueOnce([[{ id: 99 }]]); // SELECT admins → email já existe

    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "existente@kavita.com", senha: "senha123", role: "operador",
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  test("201: cria admin com sucesso — role normalizado para lowercase", async () => {
    const { app, poolMock, logMock } = setupMaster(1);

    poolMock.query
      .mockResolvedValueOnce([[{ id: 5 }]])  // SELECT admin_roles → role existe
      .mockResolvedValueOnce([[]])            // SELECT admins → email livre
      .mockResolvedValueOnce([{ insertId: 88 }]); // INSERT admins

    const res = await request(app).post(MOUNT).send({
      nome: "João Operador",
      email: "  Joao@Kavita.com  ", // normalizado internamente
      senha: "minha_senha",
      role: "OPERADOR", // será lowercased
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 88,
      nome: "João Operador",
      email: "joao@kavita.com",
      role: "operador",
      ativo: 1,
    });

    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "criar_admin", entidadeId: 88 })
    );
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupMaster();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).post(MOUNT).send({
      nome: "Novo", email: "novo@test.com", senha: "senha123", role: "operador",
    });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id
// ---------------------------------------------------------------------------

describe("PUT /api/admin/admins/:id", () => {
  test("400: body sem role e sem ativo → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, poolMock } = setupMaster();

    const res = await request(app).put(`${MOUNT}/5`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("400: role inválido no PUT → VALIDATION_ERROR", async () => {
    const { app, poolMock } = setupMaster();
    poolMock.query.mockResolvedValueOnce([[]]); // SELECT admin_roles → vazio

    const res = await request(app).put(`${MOUNT}/5`).send({ role: "naoexiste" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  test("404: admin não encontrado (affectedRows=0) → NOT_FOUND", async () => {
    const { app, poolMock } = setupMaster();

    poolMock.query
      .mockResolvedValueOnce([[{ id: 3 }]]) // SELECT admin_roles → válido
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // UPDATE → nenhuma linha

    const res = await request(app).put(`${MOUNT}/999`).send({ role: "operador" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: atualiza role com sucesso e registra log", async () => {
    const { app, poolMock, logMock } = setupMaster(1);

    poolMock.query
      .mockResolvedValueOnce([[{ id: 3 }]]) // SELECT admin_roles
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    const res = await request(app).put(`${MOUNT}/10`).send({ role: "gerente" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("atualizado") });
    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "atualizar_admin" })
    );
  });

  test("200: atualiza apenas ativo (sem role)", async () => {
    const { app, poolMock } = setupMaster();

    poolMock.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).put(`${MOUNT}/5`).send({ ativo: false });

    expect(res.status).toBe(200);

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain("ativo = ?");
    expect(params[0]).toBe(0); // false → 0
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id — regras de negócio críticas
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/admins/:id", () => {
  test("404: admin não encontrado → NOT_FOUND", async () => {
    const { app, poolMock } = setupMaster(999);
    poolMock.query.mockResolvedValueOnce([[]]); // SELECT → vazio

    const res = await request(app).delete(`${MOUNT}/888`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("[REGRA CRÍTICA] 400: admin não pode remover a si mesmo", async () => {
    // req.admin.id = 5, tentando deletar id=5
    const { app, poolMock } = setupMaster(5);
    poolMock.query.mockResolvedValueOnce([[{ id: 5, role: "operador" }]]);

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(res.body.message).toMatch(/si mesmo/i);

    // Não deve executar o DELETE
    const deleteCalls = poolMock.query.mock.calls.filter((c) =>
      String(c[0]).toLowerCase().includes("delete from admins")
    );
    expect(deleteCalls).toHaveLength(0);
  });

  test("[REGRA CRÍTICA] 400: admin master não pode ser removido", async () => {
    const { app, poolMock } = setupMaster(999);
    // id 999 tentando deletar id 1 que é master
    poolMock.query.mockResolvedValueOnce([[{ id: 1, role: "master" }]]);

    const res = await request(app).delete(`${MOUNT}/1`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(res.body.message).toMatch(/master/i);

    const deleteCalls = poolMock.query.mock.calls.filter((c) =>
      String(c[0]).toLowerCase().includes("delete from admins")
    );
    expect(deleteCalls).toHaveLength(0);
  });

  test("200: remove admin com sucesso e registra log", async () => {
    const { app, poolMock, logMock } = setupMaster(999);

    poolMock.query
      .mockResolvedValueOnce([[{ id: 10, role: "operador" }]]) // SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

    const res = await request(app).delete(`${MOUNT}/10`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("removido") });

    expect(logMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "remover_admin", entidadeId: "10" })
    );

    const deleteCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).toLowerCase().includes("delete from admins")
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall[1]).toEqual(["10"]);
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupMaster();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
