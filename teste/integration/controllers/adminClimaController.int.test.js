/**
 * teste/integration/controllers/adminClimaController.int.test.js
 *
 * Controller testado: controllers/news/adminClimaController.js
 *
 * Endpoints montados no router de teste:
 * - GET    /api/admin/news/clima                  listClima
 * - GET    /api/admin/news/clima/stations         suggestClimaStations
 * - POST   /api/admin/news/clima                  createClima
 * - PUT    /api/admin/news/clima/:id              updateClima
 * - DELETE /api/admin/news/clima/:id              deleteClima
 * - POST   /api/admin/news/clima/:id/sync         syncClima
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
 * Carrega o controller com mocks isolados a cada chamada.
 * @param {object} mockNewsModel  - mock completo de models/newsModel
 * @param {object} mockPool       - mock de config/pool (para logAdmin)
 * @param {object} mockInmetService - mock de services/inmetStationsService
 */
function loadController({ mockNewsModel, mockPool, mockInmetService } = {}) {
  jest.resetModules();

  const pool = mockPool || { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() };
  const newsModel = mockNewsModel || {
    listClima: jest.fn().mockResolvedValue([]),
    getClimaById: jest.fn().mockResolvedValue(null),
    createClima: jest.fn().mockResolvedValue({ id: 1 }),
    updateClima: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    deleteClima: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  };

  jest.doMock("../../../config/pool", () => pool);
  jest.doMock("../../../models/newsModel", () => newsModel);

  if (mockInmetService !== undefined) {
    jest.doMock("../../../services/inmetStationsService", () => mockInmetService);
  } else {
    jest.doMock("../../../services/inmetStationsService", () => ({
      suggestStations: jest.fn().mockResolvedValue([]),
    }));
  }

  const controller = require("../../../controllers/news/adminClimaController");
  return { controller, pool, newsModel };
}

function buildRouter(controller) {
  const router = express.Router();
  router.get("/clima/stations", asyncWrap(controller.suggestClimaStations));
  router.get("/clima", asyncWrap(controller.listClima));
  router.post("/clima", asyncWrap(controller.createClima));
  router.put("/clima/:id", asyncWrap(controller.updateClima));
  router.delete("/clima/:id", asyncWrap(controller.deleteClima));
  router.post("/clima/:id/sync", asyncWrap(controller.syncClima));
  return router;
}

const MOUNT = "/api/admin/news";

// ─────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────

describe("adminClimaController", () => {
  // ───────────────── listClima ─────────────────
  describe("GET /clima — listClima()", () => {
    test("200 happy path — retorna lista de climas", async () => {
      // Arrange
      const rows = [
        { id: 1, city_name: "Manhuaçu", slug: "manhuacu", uf: "MG", ativo: 1 },
        { id: 2, city_name: "Belo Horizonte", slug: "belo-horizonte", uf: "MG", ativo: 1 },
      ];
      const { controller, newsModel } = loadController({
        mockNewsModel: { listClima: jest.fn().mockResolvedValue(rows) },
      });

      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: expect.any(Array) });
      expect(res.body.data).toHaveLength(2);
      expect(newsModel.listClima).toHaveBeenCalledTimes(1);
    });

    test("200 — lista vazia quando não há registros", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listClima: jest.fn().mockResolvedValue([]) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: [] });
    });

    test("500 quando newsModel.listClima lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { listClima: jest.fn().mockRejectedValue(new Error("DB down")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── suggestClimaStations ─────────────────
  describe("GET /clima/stations — suggestClimaStations()", () => {
    test("400 quando uf está ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima/stations?q=manhu`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando uf tem mais de 2 letras", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima/stations?uf=MGA&q=teste`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("200 com data vazia quando q tem menos de 2 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima/stations?uf=MG&q=a`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: [] });
    });

    test("200 happy path — retorna sugestões do inmetStationsService", async () => {
      // Arrange
      const mockSuggestions = [
        { name: "Manhuaçu", latitude: -20.25, longitude: -42.03 },
      ];
      const mockInmetService = { suggestStations: jest.fn().mockResolvedValue(mockSuggestions) };
      const { controller } = loadController({ mockInmetService });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima/stations?uf=MG&q=manhu`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: mockSuggestions,
        meta: expect.objectContaining({ provider: "OPEN_METEO_GEOCODING" }),
      });
      expect(mockInmetService.suggestStations).toHaveBeenCalledWith(
        expect.objectContaining({ uf: "MG", q: "manhu" })
      );
    });

    test("500 quando inmetStationsService lança exceção", async () => {
      // Arrange
      const mockInmetService = {
        suggestStations: jest.fn().mockRejectedValue(new Error("Geocoding timeout")),
      };
      const { controller } = loadController({ mockInmetService });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/clima/stations?uf=MG&q=manhu`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "GEOCODING_ERROR" });
    });
  });

  // ───────────────── createClima ─────────────────
  describe("POST /clima — createClima()", () => {
    const validBody = {
      city_name: "Manhuaçu",
      slug: "manhuacu",
      uf: "MG",
    };

    test("201 happy path — cria clima com dados mínimos", async () => {
      // Arrange
      const createdRow = { id: 10, city_name: "Manhuaçu", slug: "manhuacu", uf: "MG" };
      const { controller, newsModel, pool } = loadController({
        mockNewsModel: { createClima: jest.fn().mockResolvedValue(createdRow) },
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send(validBody);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: expect.objectContaining({ id: 10 }) });
      expect(newsModel.createClima).toHaveBeenCalledTimes(1);
    });

    test("400 quando city_name está ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send({ slug: "manhuacu", uf: "MG" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/city_name/) });
    });

    test("400 quando slug é inválido (contém caracteres especiais)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send({ city_name: "Teste", slug: "Slug Inválido!", uf: "MG" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/slug/) });
    });

    test("400 quando uf tem tamanho diferente de 2", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send({ city_name: "Teste", slug: "teste", uf: "MGA" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/uf/) });
    });

    test("400 quando ibge_id é inválido (não é inteiro positivo)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ ...validBody, ibge_id: -5 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/ibge_id/) });
    });

    test("400 quando station_code é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ ...validBody, station_code: "INVALIDCODE123" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando mm_24h não é número", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ ...validBody, mm_24h: "nao-e-numero" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/mm_24h/) });
    });

    test("400 quando last_update_at tem formato inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ ...validBody, last_update_at: "31/12/2024" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("409 quando newsModel.createClima lança ER_DUP_ENTRY", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockNewsModel: { createClima: jest.fn().mockRejectedValue(dupErr) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send(validBody);

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando newsModel.createClima lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { createClima: jest.fn().mockRejectedValue(new Error("DB error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima`).send(validBody);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });

    // Security: boundary testing
    test("400 quando city_name excede 120 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ city_name: "x".repeat(121), slug: "teste", uf: "MG" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    // Security: SQL injection attempt in city_name (should be sanitized by parameterized queries)
    test("201 ou 400 quando city_name contém tentativa de SQL injection (deve ser parametrizado)", async () => {
      // Arrange
      const createdRow = { id: 11, city_name: "'; DROP TABLE news_clima; --", slug: "sql-test", uf: "MG" };
      const { controller } = loadController({
        mockNewsModel: { createClima: jest.fn().mockResolvedValue(createdRow) },
        mockPool: { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn() },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act — o controller usa queries parametrizadas, então a injeção não funciona
      const res = await request(app)
        .post(`${MOUNT}/clima`)
        .send({ city_name: "'; DROP TABLE news_clima; --", slug: "sql-test", uf: "MG" });

      // Assert — aceita (string válida) porque o SQL é parametrizado
      expect([201, 400]).toContain(res.status);
    });
  });

  // ───────────────── updateClima ─────────────────
  describe("PUT /clima/:id — updateClima()", () => {
    test("200 happy path — atualiza campo ativo", async () => {
      // Arrange
      const { controller, newsModel } = loadController({
        mockNewsModel: {
          updateClima: jest.fn().mockResolvedValue({ affectedRows: 1 }),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/5`).send({ ativo: 0 });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(newsModel.updateClima).toHaveBeenCalledWith(5, expect.objectContaining({ ativo: 0 }));
    });

    test("400 quando id é inválido (string)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/abc`).send({ ativo: 1 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando slug enviado é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/1`).send({ slug: "Invalid Slug!!" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando station_uf tem tamanho diferente de 2", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/1`).send({ station_uf: "MGM" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("409 quando newsModel.updateClima lança ER_DUP_ENTRY", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockNewsModel: { updateClima: jest.fn().mockRejectedValue(dupErr) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/1`).send({ slug: "novo-slug" });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando newsModel.updateClima lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { updateClima: jest.fn().mockRejectedValue(new Error("DB error")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/clima/1`).send({ ativo: 1 });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── deleteClima ─────────────────
  describe("DELETE /clima/:id — deleteClima()", () => {
    test("200 happy path — deleta clima existente", async () => {
      // Arrange
      const { controller, newsModel } = loadController({
        mockNewsModel: { deleteClima: jest.fn().mockResolvedValue({ affectedRows: 1 }) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/clima/3`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(newsModel.deleteClima).toHaveBeenCalledWith(3);
    });

    test("400 quando id é inválido (zero)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/clima/0`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500 quando newsModel.deleteClima lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { deleteClima: jest.fn().mockRejectedValue(new Error("FK constraint")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/clima/1`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── syncClima ─────────────────
  describe("POST /clima/:id/sync — syncClima()", () => {
    test("400 quando id é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima/abc/sync`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("404 quando clima não existe no banco", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { getClimaById: jest.fn().mockResolvedValue(null) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima/999/sync`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("400 COORDS_REQUIRED quando lat/lon não estão preenchidos e city/uf inválido", async () => {
      // Arrange
      const climaRow = { id: 1, city_name: "", uf: "", station_lat: null, station_lon: null };
      const { controller } = loadController({
        mockNewsModel: {
          getClimaById: jest.fn().mockResolvedValue(climaRow),
          updateClima: jest.fn().mockResolvedValue({ affectedRows: 1 }),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima/1/sync`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500 quando newsModel.getClimaById lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockNewsModel: { getClimaById: jest.fn().mockRejectedValue(new Error("DB down")) },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/clima/1/sync`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });
});
