/**
 * test/integration/adminCategorias.int.test.js
 *
 * Rotas testadas (routes/admin/adminCategorias.js — LEGADO):
 *   GET    /api/admin/categorias
 *   POST   /api/admin/categorias
 *   PUT    /api/admin/categorias/:id
 *   PATCH  /api/admin/categorias/:id/status
 *   DELETE /api/admin/categorias/:id
 *
 * Objetivo: travar comportamento atual antes da migração para o padrão moderno.
 *
 * Notas sobre o contrato legado (IMPORTANTE para quem for migrar):
 *   - GET /  →  array cru sem envelope { ok, data } — comportamento atual, NÃO é o padrão moderno
 *   - POST 201 →  payload direto sem { ok: true } — idem
 *   - Erros (4xx/5xx) usam { ok: false, code, message } — já alinhado
 *   - Erros 500 chegam como res.status(500).json(…), não via AppError/next()
 *
 * Estratégia de mock:
 *   - pool.query mockado (sem banco real)
 *   - verifyAdmin mockado (define req.admin; controla 401)
 *   - jest.resetModules() em cada setup para isolamento completo
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

const POOL_PATH = require.resolve("../../config/pool");
const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const ROUTER_PATH = require.resolve("../../routes/admin/adminCategorias");
const MOUNT = "/api/admin/categorias";

// ---------------------------------------------------------------------------
// Helpers de setup
// ---------------------------------------------------------------------------

function setupAuthenticated() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };
  const verifyAdminMock = jest.fn((req, _res, next) => {
    req.admin = { id: 1, role: "master" };
    return next();
  });

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock, verifyAdminMock };
}

function setupBlocked401() {
  jest.resetModules();

  const poolMock = { query: jest.fn() };
  const verifyAdminMock = jest.fn((_req, res) =>
    res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Não autenticado." })
  );

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(VERIFY_ADMIN_PATH, () => verifyAdminMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, poolMock };
}

// ---------------------------------------------------------------------------
// Auth guard — verifica que verifyAdmin está na frente de TODAS as rotas
// ---------------------------------------------------------------------------

describe("adminCategorias — auth guard", () => {
  test("GET / sem auth → 401 e não consulta o banco", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("POST / sem auth → 401 e não consulta o banco", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).post(MOUNT).send({ name: "Ração" });

    expect(res.status).toBe(401);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("DELETE /:id sem auth → 401 e não consulta o banco", async () => {
    const { app, poolMock } = setupBlocked401();

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(401);
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /api/admin/categorias", () => {
  test("200: retorna array de categorias ordenado", async () => {
    const { app, poolMock } = setupAuthenticated();

    const rows = [
      { id: 1, name: "Ração", slug: "racao", is_active: 1, sort_order: 1 },
      { id: 2, name: "Brinquedos", slug: "brinquedos", is_active: 1, sort_order: 2 },
    ];
    poolMock.query.mockResolvedValueOnce([rows]);

    const res = await request(app).get(MOUNT);

    // Contrato legado: array direto, sem envelope { ok, data }
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 1, name: "Ração", slug: "racao" });
  });

  test("200: retorna array vazio quando não há categorias", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe("POST /api/admin/categorias", () => {
  test("400: name vazio → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, poolMock } = setupAuthenticated();

    const res = await request(app).post(MOUNT).send({ name: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("400: name ausente → VALIDATION_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();

    const res = await request(app).post(MOUNT).send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  test("201: cria categoria e retorna payload com slug gerado a partir do name", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const res = await request(app).post(MOUNT).send({ name: "Higiene Animal", sort_order: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 42,
      name: "Higiene Animal",
      slug: "higiene-animal",
      is_active: 1,
      sort_order: 3,
    });

    // Verifica que o INSERT recebeu os valores corretos
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO categories");
    expect(params[0]).toBe("Higiene Animal");
    expect(params[1]).toBe("higiene-animal");
    expect(params[2]).toBe(3);
  });

  test("201: slug explícito é respeitado (slugificado)", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ insertId: 7 }]);

    const res = await request(app).post(MOUNT).send({ name: "Ração", slug: "Racao Premium" });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("racao-premium");
  });

  test("409: ER_DUP_ENTRY → CONFLICT", async () => {
    const { app, poolMock } = setupAuthenticated();
    const dupErr = new Error("dup");
    dupErr.code = "ER_DUP_ENTRY";
    poolMock.query.mockRejectedValueOnce(dupErr);

    const res = await request(app).post(MOUNT).send({ name: "Ração" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  test("500: erro inesperado → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).post(MOUNT).send({ name: "Ração" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id
// ---------------------------------------------------------------------------

describe("PUT /api/admin/categorias/:id", () => {
  test("404: categoria não existe → NOT_FOUND", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([[]]); // SELECT retorna vazio

    const res = await request(app).put(`${MOUNT}/999`).send({ name: "Novo" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: atualiza name mas preserva slug atual quando slug não é enviado", async () => {
    // Comportamento legado documentado: slug só regenera se slug explícito vier no body.
    // Se slug não é enviado, current.slug é preservado (current.slug || slugify(newName)).
    // Isso garante que mudar o nome não quebra URLs existentes de produtos nessa categoria.
    const { app, poolMock } = setupAuthenticated();
    const current = { id: 5, name: "Antigo", slug: "antigo", sort_order: 1, is_active: 1 };

    poolMock.query
      .mockResolvedValueOnce([[current]]) // SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    const res = await request(app).put(`${MOUNT}/5`).send({ name: "Alimentação" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 5,
      name: "Alimentação",
      slug: "antigo",   // slug preservado — não regenerado ao mudar só o name
      is_active: 1,
    });
  });

  test("200: slug explícito no body sobrescreve o slug atual (slugificado)", async () => {
    const { app, poolMock } = setupAuthenticated();
    const current = { id: 3, name: "Cat", slug: "cat-slug-customizado", sort_order: 0, is_active: 1 };

    poolMock.query
      .mockResolvedValueOnce([[current]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).put(`${MOUNT}/3`).send({ slug: "Novo Slug Bonito" });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("novo-slug-bonito"); // slug explícito → slugificado e aplicado
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).put(`${MOUNT}/1`).send({ name: "X" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id/status
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/categorias/:id/status", () => {
  test("404: categoria não existe (affectedRows=0) → NOT_FOUND", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).patch(`${MOUNT}/999/status`).send({ is_active: true });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: ativa categoria (is_active=true → 1)", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).patch(`${MOUNT}/5/status`).send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("atualizado") });

    const [, params] = poolMock.query.mock.calls[0];
    expect(params[0]).toBe(1); // is_active ? 1 : 0
    expect(params[1]).toBe("5");
  });

  test("200: desativa categoria (is_active=false → 0)", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).patch(`${MOUNT}/5/status`).send({ is_active: false });

    expect(res.status).toBe(200);
    const [, params] = poolMock.query.mock.calls[0];
    expect(params[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/categorias/:id", () => {
  test("404: categoria não existe (affectedRows=0) → NOT_FOUND", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).delete(`${MOUNT}/999`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: remove categoria com sucesso", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: expect.stringContaining("removida") });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM categories");
    expect(params).toEqual(["5"]);
  });

  test("500: erro de banco → SERVER_ERROR", async () => {
    const { app, poolMock } = setupAuthenticated();
    poolMock.query.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).delete(`${MOUNT}/1`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
