/**
 * test/integration/adminCategorias.int.test.js
 *
 * Rotas testadas (routes/admin/adminCategorias.js — padrão moderno):
 *   GET    /api/admin/categorias
 *   POST   /api/admin/categorias
 *   PUT    /api/admin/categorias/:id
 *   PATCH  /api/admin/categorias/:id/status
 *   DELETE /api/admin/categorias/:id
 *
 * Contrato moderno (diferença em relação ao legado):
 *   GET    → { ok: true, data: [...] }           (era array cru)
 *   POST   → { ok: true, data: { id, ... } } 201 (era payload cru 201)
 *   PUT    → { ok: true, data: { id, ... } }     (era payload cru)
 *   PATCH  → { ok: true, message: "..." }        (era { message: "..." })
 *   DELETE → { ok: true, message: "..." }        (era { message: "..." })
 *   Erros  → { ok: false, code, message }        (mantido)
 *
 * Estratégia de mock:
 *   - categoriasRepository mockado via jest.doMock — cobre controller+service
 *   - verifyAdmin NÃO é mockado aqui: está em routes/index.js (mount level),
 *     não no arquivo de rota. Já coberto por verifyAdmin.unit.test.js.
 *   - Nenhuma conexão real ao banco.
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

const REPO_PATH = require.resolve("../../repositories/categoriasRepository");
const ROUTER_PATH = require.resolve("../../routes/admin/adminCategorias");
const MOUNT = "/api/admin/categorias";

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setup(repoOverrides = {}) {
  jest.resetModules();

  const repoMock = {
    listCategories: jest.fn(),
    findCategoryById: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    updateCategoryStatus: jest.fn(),
    deleteCategory: jest.fn(),
    ...repoOverrides,
  };

  jest.doMock(REPO_PATH, () => repoMock);

  const router = require(ROUTER_PATH);
  const app = makeTestApp(MOUNT, router);

  return { app, repoMock };
}

function makeRow(overrides = {}) {
  return {
    id: 1,
    name: "Ração",
    slug: "racao",
    is_active: 1,
    sort_order: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /api/admin/categorias", () => {
  test("200: retorna { ok: true, data: [...] } com array de categorias", async () => {
    const rows = [
      makeRow({ id: 1 }),
      makeRow({ id: 2, name: "Brinquedos", slug: "brinquedos" }),
    ];
    const { app } = setup({ listCategories: jest.fn().mockResolvedValue(rows) });

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ id: 1, name: "Ração" });
  });

  test("200: data é array vazio quando não há categorias", async () => {
    const { app } = setup({ listCategories: jest.fn().mockResolvedValue([]) });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      listCategories: jest.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe("POST /api/admin/categorias", () => {
  test("400: name ausente → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).post(MOUNT).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.createCategory).not.toHaveBeenCalled();
  });

  test("400: name em branco → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).post(MOUNT).send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.createCategory).not.toHaveBeenCalled();
  });

  test("201: cria categoria e retorna { ok, data } com slug gerado a partir do name", async () => {
    const { app, repoMock } = setup({
      createCategory: jest.fn().mockResolvedValue(42),
    });

    const res = await request(app)
      .post(MOUNT)
      .send({ name: "Higiene Animal", sort_order: 3 });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 42,
      name: "Higiene Animal",
      slug: "higiene-animal",
      is_active: 1,
      sort_order: 3,
    });
    expect(repoMock.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Higiene Animal", slug: "higiene-animal", sort_order: 3 })
    );
  });

  test("201: slug explícito no body é slugificado", async () => {
    const { app } = setup({ createCategory: jest.fn().mockResolvedValue(7) });
    const res = await request(app).post(MOUNT).send({ name: "Ração", slug: "Racao Premium" });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("racao-premium");
  });

  test("409: ER_DUP_ENTRY → CONFLICT", async () => {
    const dupErr = Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" });
    const { app } = setup({ createCategory: jest.fn().mockRejectedValue(dupErr) });
    const res = await request(app).post(MOUNT).send({ name: "Ração" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  test("500: erro inesperado → SERVER_ERROR", async () => {
    const { app } = setup({
      createCategory: jest.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await request(app).post(MOUNT).send({ name: "Ração" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PUT /:id
// ---------------------------------------------------------------------------

describe("PUT /api/admin/categorias/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).put(`${MOUNT}/abc`).send({ name: "X" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.findCategoryById).not.toHaveBeenCalled();
  });

  test("400: id zero → VALIDATION_ERROR", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).put(`${MOUNT}/0`).send({ name: "X" });
    expect(res.status).toBe(400);
    expect(repoMock.findCategoryById).not.toHaveBeenCalled();
  });

  test("404: categoria não encontrada → NOT_FOUND", async () => {
    const { app } = setup({ findCategoryById: jest.fn().mockResolvedValue(null) });
    const res = await request(app).put(`${MOUNT}/999`).send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: atualiza name e preserva slug atual quando slug não enviado", async () => {
    const current = makeRow({ id: 5, slug: "antigo", sort_order: 1 });
    const { app } = setup({
      findCategoryById: jest.fn().mockResolvedValue(current),
      updateCategory: jest.fn().mockResolvedValue(undefined),
    });

    const res = await request(app).put(`${MOUNT}/5`).send({ name: "Alimentação" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 5,
      name: "Alimentação",
      slug: "antigo",   // slug NÃO é regenerado ao mudar só o name
      is_active: 1,
    });
  });

  test("200: slug explícito sobrescreve o atual (slugificado)", async () => {
    const current = makeRow({ id: 3, slug: "antigo" });
    const { app } = setup({
      findCategoryById: jest.fn().mockResolvedValue(current),
      updateCategory: jest.fn().mockResolvedValue(undefined),
    });

    const res = await request(app).put(`${MOUNT}/3`).send({ slug: "Novo Slug Bonito" });

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe("novo-slug-bonito");
  });

  test("200: req.params.id é coercido para número — repo recebe número, não string", async () => {
    const current = makeRow({ id: 7 });
    const { app, repoMock } = setup({
      findCategoryById: jest.fn().mockResolvedValue(current),
      updateCategory: jest.fn().mockResolvedValue(undefined),
    });

    await request(app).put(`${MOUNT}/7`).send({});

    expect(repoMock.findCategoryById).toHaveBeenCalledWith(7); // número, não "7"
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      findCategoryById: jest.fn().mockRejectedValue(new Error("db fail")),
    });
    const res = await request(app).put(`${MOUNT}/1`).send({ name: "X" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id/status
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/categorias/:id/status", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).patch(`${MOUNT}/abc/status`).send({ is_active: true });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.updateCategoryStatus).not.toHaveBeenCalled();
  });

  test("400: is_active ausente → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).patch(`${MOUNT}/5/status`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.updateCategoryStatus).not.toHaveBeenCalled();
  });

  test("404: categoria não existe → NOT_FOUND", async () => {
    const { app } = setup({ updateCategoryStatus: jest.fn().mockResolvedValue(0) });
    const res = await request(app).patch(`${MOUNT}/999/status`).send({ is_active: true });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: ativa categoria — repo chamado com id como número e is_active=true", async () => {
    const { app, repoMock } = setup({
      updateCategoryStatus: jest.fn().mockResolvedValue(1),
    });

    const res = await request(app).patch(`${MOUNT}/5/status`).send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/atualizado/i);
    expect(repoMock.updateCategoryStatus).toHaveBeenCalledWith(5, true);
  });

  test("200: desativa categoria — repo chamado com is_active=false", async () => {
    const { app, repoMock } = setup({
      updateCategoryStatus: jest.fn().mockResolvedValue(1),
    });
    await request(app).patch(`${MOUNT}/5/status`).send({ is_active: false });
    expect(repoMock.updateCategoryStatus).toHaveBeenCalledWith(5, false);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/categorias/:id", () => {
  test("400: id não numérico → VALIDATION_ERROR sem consultar banco", async () => {
    const { app, repoMock } = setup();
    const res = await request(app).delete(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repoMock.deleteCategory).not.toHaveBeenCalled();
  });

  test("404: categoria não existe → NOT_FOUND", async () => {
    const { app } = setup({ deleteCategory: jest.fn().mockResolvedValue(0) });
    const res = await request(app).delete(`${MOUNT}/999`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("200: remove categoria — resposta com { ok: true, message }", async () => {
    const { app, repoMock } = setup({
      deleteCategory: jest.fn().mockResolvedValue(1),
    });

    const res = await request(app).delete(`${MOUNT}/5`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/removida/i);
    expect(repoMock.deleteCategory).toHaveBeenCalledWith(5);
  });

  test("500: erro de repositório → SERVER_ERROR", async () => {
    const { app } = setup({
      deleteCategory: jest.fn().mockRejectedValue(new Error("db fail")),
    });
    const res = await request(app).delete(`${MOUNT}/1`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
});
