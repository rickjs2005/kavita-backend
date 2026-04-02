// test/integration/adminShippingZones.int.test.js
//
// Testa a rota moderna routes/admin/adminShippingZones.js
// Mock boundary: shippingZonesService (controller delega inteiramente ao service)

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Admin Shipping Zones Routes (integration)", () => {
  let app;
  let service;

  const servicePath = require.resolve("../../services/shippingZonesService");
  const routerPath = require.resolve("../../routes/admin/adminShippingZones");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock do service — boundary correta para teste de rota moderna
    jest.doMock(servicePath, () => ({
      listZones: jest.fn(),
      createZone: jest.fn(),
      updateZone: jest.fn(),
      deleteZone: jest.fn(),
    }));

    const router = require(routerPath);
    service = require(servicePath);
    app = makeTestApp("/api/admin/shipping", router);
  });

  // =========================================================================
  // GET /api/admin/shipping/zones
  // =========================================================================

  describe("GET /api/admin/shipping/zones", () => {
    test("retorna [] quando não há zonas", async () => {
      service.listZones.mockResolvedValueOnce([]);

      const res = await request(app).get("/api/admin/shipping/zones");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: [] });
      expect(service.listZones).toHaveBeenCalledTimes(1);
    });

    test("retorna zonas normalizadas pelo service", async () => {
      service.listZones.mockResolvedValueOnce([
        {
          id: 10,
          name: "MG - Zona A",
          state: "MG",
          all_cities: false,
          is_free: false,
          price: 19.9,
          prazo_dias: 3,
          is_active: true,
          cities: ["Belo Horizonte", "Contagem"],
        },
      ]);

      const res = await request(app).get("/api/admin/shipping/zones");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveLength(1);

      const z = res.body.data[0];
      expect(z.id).toBe(10);
      expect(z.all_cities).toBe(false);
      expect(z.price).toBe(19.9);
      expect(z.cities).toEqual(["Belo Horizonte", "Contagem"]);
    });

    test("500 em erro inesperado", async () => {
      service.listZones.mockRejectedValueOnce(new Error("db down"));

      const res = await request(app).get("/api/admin/shipping/zones");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  // =========================================================================
  // POST /api/admin/shipping/zones
  // =========================================================================

  describe("POST /api/admin/shipping/zones", () => {
    const validPayload = {
      name: "Zona SP",
      state: "SP",
      all_cities: true,
      is_free: true,
    };

    test("201 cria zona", async () => {
      service.createZone.mockResolvedValueOnce({ id: 123 });

      const res = await request(app)
        .post("/api/admin/shipping/zones")
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: { id: 123 } });
      expect(service.createZone).toHaveBeenCalledTimes(1);
    });

    test("400 se name vazio (Zod validation)", async () => {
      const res = await request(app)
        .post("/api/admin/shipping/zones")
        .send({ ...validPayload, name: "" });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(service.createZone).not.toHaveBeenCalled();
    });

    test("400 se state inválido (Zod validation)", async () => {
      const res = await request(app)
        .post("/api/admin/shipping/zones")
        .send({ ...validPayload, state: "X" });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(service.createZone).not.toHaveBeenCalled();
    });

    test("500 em erro no service", async () => {
      service.createZone.mockRejectedValueOnce(new Error("insert failed"));

      const res = await request(app)
        .post("/api/admin/shipping/zones")
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  // =========================================================================
  // PUT /api/admin/shipping/zones/:id
  // =========================================================================

  describe("PUT /api/admin/shipping/zones/:id", () => {
    const validPayload = {
      name: "Zona SP Edit",
      state: "SP",
      all_cities: false,
      is_free: true,
      cities: ["São Paulo", "Campinas"],
    };

    test("200 atualiza zona", async () => {
      service.updateZone.mockResolvedValueOnce();

      const res = await request(app)
        .put("/api/admin/shipping/zones/10")
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(service.updateZone).toHaveBeenCalledTimes(1);
    });

    test("400 se ID inválido (Zod params)", async () => {
      const res = await request(app)
        .put("/api/admin/shipping/zones/abc")
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(service.updateZone).not.toHaveBeenCalled();
    });

    test("404 propagado do service (AppError)", async () => {
      const AppError = require("../../errors/AppError");
      const ERROR_CODES = require("../../constants/ErrorCodes");
      service.updateZone.mockRejectedValueOnce(
        new AppError("Zona não encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );

      const res = await request(app)
        .put("/api/admin/shipping/zones/999")
        .send(validPayload);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("500 em erro inesperado no service", async () => {
      service.updateZone.mockRejectedValueOnce(new Error("update failed"));

      const res = await request(app)
        .put("/api/admin/shipping/zones/10")
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  // =========================================================================
  // DELETE /api/admin/shipping/zones/:id
  // =========================================================================

  describe("DELETE /api/admin/shipping/zones/:id", () => {
    test("204 remove zona", async () => {
      service.deleteZone.mockResolvedValueOnce();

      const res = await request(app).delete("/api/admin/shipping/zones/10");

      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect(service.deleteZone).toHaveBeenCalledWith(10);
    });

    test("400 se ID inválido (Zod params)", async () => {
      const res = await request(app).delete("/api/admin/shipping/zones/abc");

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(service.deleteZone).not.toHaveBeenCalled();
    });

    test("500 em erro inesperado", async () => {
      service.deleteZone.mockRejectedValueOnce(new Error("db fail"));

      const res = await request(app).delete("/api/admin/shipping/zones/10");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });
});
