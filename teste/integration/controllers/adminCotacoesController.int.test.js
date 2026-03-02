/**
 * teste/integration/controllers/adminCotacoesController.int.test.js
 *
 * Controller testado: controllers/news/adminCotacoesController.js
 *
 * Endpoints montados no router de teste:
 * - GET    /api/admin/news/cotacoes           listCotacoes
 * - GET    /api/admin/news/cotacoes/meta      getCotacoesMeta
 * - POST   /api/admin/news/cotacoes           createCotacao
 * - PUT    /api/admin/news/cotacoes/:id       updateCotacao
 * - DELETE /api/admin/news/cotacoes/:id       deleteCotacao
 * - POST   /api/admin/news/cotacoes/:id/sync  syncCotacao
 * - POST   /api/admin/news/cotacoes/sync-all  syncCotacoesAll
 *
 * Regras do projeto:
 * - Sem MySQL real: mock de config/pool e models/newsModel
 * - AAA em todos os testes
 * - Erros: validar { ok, code, message } e status HTTP
 *
 * NOTA DE SEGURANÇA:
 * ⚠️  O controller NÃO possui middleware verifyAdmin — qualquer request chega
 *     sem autenticação. Os testes documentam esse comportamento atual.
 */

"use strict";

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../../testUtils");

// ─────────────────────────────────────────────
// Helpers de teste
// ─────────────────────────────────────────────

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Carrega o controller com mocks isolados.
 */
function loadController({ mockNewsModel, mockPool, mockCotacoesProviders } = {}) {
  jest.resetModules();

  const pool = mockPool || { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() };

  const newsModel = mockNewsModel || {
    listCotacoes: jest.fn().mockResolvedValue([]),
    getCotacaoById: jest.fn().mockResolvedValue(null),
    createCotacao: jest.fn().mockResolvedValue({ id: 1 }),
    updateCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    deleteCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    cotacoesMeta: jest.fn().mockResolvedValue({ markets: [], sources: [], units: [], types: [] }),
    insertCotacaoHistory: jest.fn().mockResolvedValue({ id: 1 }),
  };

  jest.doMock("../../../config/pool", () => pool);
  jest.doMock("../../../models/newsModel", () => newsModel);

  if (mockCotacoesProviders !== undefined) {
    jest.doMock("../../../services/cotacoesProviders", () => mockCotacoesProviders);
  } else {
    jest.doMock("../../../services/cotacoesProviders", () => null);
  }

  const controller = require("../../../controllers/news/adminCotacoesController");
  return { controller, pool, newsModel };
}

function buildRouter(controller) {
  const router = express.Router();
  // Meta and sync-all must come before /:id routes to avoid conflicts
  router.get("/cotacoes/meta", asyncWrap(controller.getCotacoesMeta));
  router.post("/cotacoes/sync-all", asyncWrap(controller.syncCotacoesAll));
  router.get("/cotacoes", asyncWrap(controller.listCotacoes));
  router.post("/cotacoes", asyncWrap(controller.createCotacao));
  router.put("/cotacoes/:id", asyncWrap(controller.updateCotacao));
  router.delete("/cotacoes/:id", asyncWrap(controller.deleteCotacao));
  router.post("/cotacoes/:id/sync", asyncWrap(controller.syncCotacao));
  return router;
}

const MOUNT = "/api/admin/news";

// ─────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────

describe("adminCotacoesController", () => {
  // ───────────────── listCotacoes ─────────────────
  describe("GET /cotacoes — listCotacoes()", () => {
    test("200 happy path — retorna lista de cotações", async () => {
      // Arrange
      const rows = [
        { id: 1, name: "Soja", slug: "soja", type: "graos", ativo: 1 },
        { id: 2, name: "Milho", slug: "milho", type: "graos", ativo: 1 },
      ];
      const { controller, newsModel } = loadController({
        mockNewsModel: { listCotacoes: jest.fn().mockResolvedValue(rows) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: expect.any(Array) });
      expect(res.body.data).toHaveLength(2);
      expect(newsModel.listCotacoes).toHaveBeenCalledTimes(1);
    });

    test("200 — lista vazia quando não há registros", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listCotacoes: jest.fn().mockResolvedValue([]) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: [] });
    });

    test("500 quando newsModel.listCotacoes lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listCotacoes: jest.fn().mockRejectedValue(new Error("DB down")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── getCotacoesMeta ─────────────────
  describe("GET /cotacoes/meta — getCotacoesMeta()", () => {
    test("200 happy path — retorna meta de cotações", async () => {
      // Arrange
      const meta = {
        markets: ["CBOT", "B3"],
        sources: ["OPEN_FINANCE"],
        units: ["saca", "bushel"],
        types: ["graos", "carnes"],
      };
      const { controller } = loadController({
        mockNewsModel: { cotacoesMeta: jest.fn().mockResolvedValue(meta) },
        mockCotacoesProviders: { PRESETS: { soja: { name: "Soja" } }, resolveProvider: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes/meta`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          allowed_slugs: expect.any(Array),
          presets: expect.any(Object),
          suggestions: expect.any(Object),
        }),
      });
    });

    test("200 — retorna estrutura válida quando cotacoesProviders é null", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { cotacoesMeta: jest.fn().mockResolvedValue({ markets: [], sources: [], units: [], types: [] }) },
        mockCotacoesProviders: null,
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes/meta`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: expect.objectContaining({ allowed_slugs: [], presets: {} }),
      });
    });

    test("500 quando cotacoesMeta lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { cotacoesMeta: jest.fn().mockRejectedValue(new Error("DB error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/cotacoes/meta`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── createCotacao ─────────────────
  describe("POST /cotacoes — createCotacao()", () => {
    const validBody = { name: "Soja", slug: "soja", type: "graos" };

    test("201 happy path — cria cotação com dados mínimos", async () => {
      // Arrange
      const createdRow = { id: 5, name: "Soja", slug: "soja", type: "graos" };
      const { controller, newsModel } = loadController({
        mockNewsModel: { createCotacao: jest.fn().mockResolvedValue(createdRow) },
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send(validBody);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: expect.objectContaining({ id: 5 }) });
      expect(newsModel.createCotacao).toHaveBeenCalledTimes(1);
    });

    test("400 quando name está ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send({ slug: "soja", type: "graos" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/name/) });
    });

    test("400 quando slug é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send({ name: "Soja", slug: "SOJA INVÁLIDO", type: "graos" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/slug/) });
    });

    test("400 quando type está ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send({ name: "Soja", slug: "soja" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/type/) });
    });

    test("400 quando price é string não numérica", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/cotacoes`)
        .send({ ...validBody, price: "nao-e-numero" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/price/) });
    });

    test("400 quando last_update_at tem formato inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/cotacoes`)
        .send({ ...validBody, last_update_at: "31-12-2024" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando market excede 120 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/cotacoes`)
        .send({ ...validBody, market: "x".repeat(121) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("409 quando newsModel.createCotacao lança ER_DUP_ENTRY", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockNewsModel: { createCotacao: jest.fn().mockRejectedValue(dupErr) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send(validBody);

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando newsModel.createCotacao lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { createCotacao: jest.fn().mockRejectedValue(new Error("DB error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes`).send(validBody);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── updateCotacao ─────────────────
  describe("PUT /cotacoes/:id — updateCotacao()", () => {
    test("200 happy path — atualiza campo price", async () => {
      // Arrange
      const { controller, newsModel } = loadController({
        mockNewsModel: { updateCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/3`).send({ price: 120.5 });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(newsModel.updateCotacao).toHaveBeenCalledWith(3, expect.objectContaining({ price: 120.5 }));
    });

    test("400 quando id é inválido (string não numérica)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/abc`).send({ price: 100 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando slug atualizado é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/1`).send({ slug: "SLUG INVÁLIDO!" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando price enviado não é número", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/1`).send({ price: "invalido" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("409 quando newsModel.updateCotacao lança ER_DUP_ENTRY", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockNewsModel: { updateCotacao: jest.fn().mockRejectedValue(dupErr) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/1`).send({ slug: "novo-slug" });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando newsModel.updateCotacao lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { updateCotacao: jest.fn().mockRejectedValue(new Error("DB error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/cotacoes/1`).send({ price: 100 });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── deleteCotacao ─────────────────
  describe("DELETE /cotacoes/:id — deleteCotacao()", () => {
    test("200 happy path — remove cotação existente", async () => {
      // Arrange
      const { controller, newsModel } = loadController({
        mockNewsModel: { deleteCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/cotacoes/7`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(newsModel.deleteCotacao).toHaveBeenCalledWith(7);
    });

    test("400 quando id é zero", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/cotacoes/0`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500 quando newsModel.deleteCotacao lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { deleteCotacao: jest.fn().mockRejectedValue(new Error("FK error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/cotacoes/1`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── syncCotacao ─────────────────
  describe("POST /cotacoes/:id/sync — syncCotacao()", () => {
    test("400 quando id é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/abc/sync`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("404 quando cotação não existe", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { getCotacaoById: jest.fn().mockResolvedValue(null) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/999/sync`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("200 com provider.ok=false quando cotacoesProviders não está implementado", async () => {
      // Arrange
      const row = { id: 1, name: "Soja", slug: "soja", type: "graos", price: 100, ativo: 1 };
      const { controller } = loadController({
        mockNewsModel: {
          getCotacaoById: jest.fn().mockResolvedValue(row),
          updateCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }),
          insertCotacaoHistory: jest.fn().mockResolvedValue({ id: 1 }),
        },
        mockCotacoesProviders: null,
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/1/sync`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        meta: expect.objectContaining({
          provider: expect.objectContaining({ ok: false, code: "PROVIDER_NOT_IMPLEMENTED" }),
        }),
      });
    });

    test("200 com provider.ok=true quando provider resolve com sucesso", async () => {
      // Arrange
      const row = { id: 1, name: "Soja", slug: "soja", group_key: "graos", price: 100, ativo: 1 };
      const updatedRow = { ...row, price: 115.5, last_sync_status: "ok" };
      const mockProvider = {
        resolveProvider: jest.fn().mockResolvedValue({
          ok: true,
          data: { price: 115.5, source: "TEST_PROVIDER", observed_at: "2024-01-01 10:00:00" },
        }),
      };
      const { controller } = loadController({
        mockNewsModel: {
          getCotacaoById: jest.fn()
            .mockResolvedValueOnce(row)
            .mockResolvedValueOnce(updatedRow),
          updateCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }),
          insertCotacaoHistory: jest.fn().mockResolvedValue({ id: 1 }),
        },
        mockCotacoesProviders: mockProvider,
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/1/sync`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        meta: expect.objectContaining({
          provider: expect.objectContaining({ ok: true }),
        }),
      });
    });

    test("500 quando newsModel.getCotacaoById lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { getCotacaoById: jest.fn().mockRejectedValue(new Error("DB down")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/1/sync`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── syncCotacoesAll ─────────────────
  describe("POST /cotacoes/sync-all — syncCotacoesAll()", () => {
    test("200 happy path — sincroniza todos os ativos (com provider null)", async () => {
      // Arrange
      const rows = [
        { id: 1, slug: "soja", ativo: 1, price: 100 },
        { id: 2, slug: "milho", ativo: 0, price: 80 }, // inativo, deve ser ignorado
      ];
      const { controller } = loadController({
        mockNewsModel: {
          listCotacoes: jest.fn().mockResolvedValue(rows),
          updateCotacao: jest.fn().mockResolvedValue({ affectedRows: 1 }),
          insertCotacaoHistory: jest.fn().mockResolvedValue({ id: 1 }),
        },
        mockCotacoesProviders: null,
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/sync-all`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          total: 1, // apenas o ativo
          items: expect.any(Array),
        }),
      });
    });

    test("200 — retorna summary vazio quando não há cotações", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listCotacoes: jest.fn().mockResolvedValue([]) },
        mockCotacoesProviders: null,
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/sync-all`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: expect.objectContaining({ total: 0, ok: 0, error: 0 }),
      });
    });

    test("500 quando newsModel.listCotacoes lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listCotacoes: jest.fn().mockRejectedValue(new Error("DB down")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/cotacoes/sync-all`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });
});
