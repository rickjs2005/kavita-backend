/**
 * test/integration/adminConfig.int.test.js
 *
 * Rotas testadas:
 * - GET    /api/admin/config               (busca configurações da loja)
 * - PUT    /api/admin/config               (atualiza configurações)
 * - GET    /api/admin/config/categories    (lista categorias)
 * - POST   /api/admin/config/categories    (cria categoria)
 * - PUT    /api/admin/config/categories/:id (atualiza categoria)
 *
 * Regras:
 * - Pool mockado (pool.query) — sem banco real
 * - Auth mockado (verifyAdmin)
 * - Arrange → Act → Assert
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("AdminConfig routes (routes/admin/adminConfig.js)", () => {
  const originalEnv = process.env;

  function setup() {
    jest.resetModules();

    process.env = { ...originalEnv, NODE_ENV: "test" };

    const poolMock = { query: jest.fn() };

    const verifyAdminMock = jest.fn((req, _res, next) => {
      req.user = { id: 1, role: "admin" };
      return next();
    });

    jest.doMock(require.resolve("../../config/pool"), () => poolMock);
    jest.doMock(require.resolve("../../middleware/verifyAdmin"), () => verifyAdminMock);

    const router = require("../../routes/admin/adminConfig");
    const app = makeTestApp("/api/admin/config", router);

    return { app, poolMock };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  /* ------------------------------------------------------------------ */
  /*  GET /                                                               */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/config", () => {
    test("200: retorna configurações normalizadas", async () => {
      const { app, poolMock } = setup();

      const settingsRow = {
        id: 1,
        store_name: "Kavita",
        store_slug: "kavita-agro",
        cnpj: null,
        main_email: null,
        main_whatsapp: null,
        logo_url: null,
        address_city: null,
        address_state: null,
        address_street: null,
        address_neighborhood: null,
        address_zip: null,
        footer_tagline: null,
        contact_whatsapp: null,
        contact_email: null,
        social_instagram_url: null,
        social_whatsapp_url: null,
        footer_partner_cta_enabled: 1,
        footer_partner_cta_title: null,
        footer_partner_cta_text: null,
        footer_partner_cta_href: null,
        footer_links: null,
        checkout_require_cpf: 1,
        checkout_require_address: 1,
        checkout_allow_pickup: 0,
        checkout_enable_coupons: 1,
        checkout_enable_abandoned_cart: 1,
        payment_pix_enabled: 1,
        payment_card_enabled: 1,
        payment_boleto_enabled: 0,
        mp_public_key: null,
        mp_access_token: null,
        mp_auto_return: "approved",
        mp_sandbox_mode: 1,
        shipping_flat_enabled: 0,
        shipping_flat_value: 0,
        shipping_free_over: 0,
        shipping_region_text: null,
        shipping_deadline_text: null,
        comm_email_enabled: 1,
        comm_whatsapp_enabled: 1,
        seo_title: null,
        seo_description: null,
        google_analytics_id: null,
        facebook_pixel_id: null,
      };

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("SELECT id FROM shop_settings")) return [[{ id: 1 }]];
        if (String(sql).includes("SELECT * FROM shop_settings")) return [[settingsRow]];
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/config");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 1,
        store_name: "Kavita",
        store_slug: "kavita-agro",
        checkout_require_cpf: true,
        payment_boleto_enabled: false,
        mp_sandbox_mode: true,
        footer_links: null,
      });
    });

    test("200: cria registro padrão quando shop_settings está vazio", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("SELECT id FROM shop_settings")) return [[]];
        if (String(sql).includes("INSERT INTO shop_settings")) return [{ insertId: 1 }];
        if (String(sql).includes("SELECT * FROM shop_settings")) {
          return [[{ id: 1, store_name: "Kavita", store_slug: "kavita-agro" }]];
        }
        return [[]];
      });

      const res = await request(app).get("/api/admin/config");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.store_name).toBe("Kavita");
    });

    test("500: erro no banco retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockRejectedValue(new Error("DB error"));

      const res = await request(app).get("/api/admin/config");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  PUT /                                                               */
  /* ------------------------------------------------------------------ */

  describe("PUT /api/admin/config", () => {
    test("200: atualiza store_name com sucesso", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("SELECT id FROM shop_settings")) return [[{ id: 1 }]];
        if (String(sql).includes("SELECT * FROM shop_settings")) {
          return [[{ id: 1, store_name: "Antigo", store_slug: "slug" }]];
        }
        if (String(sql).includes("UPDATE shop_settings")) return [{ affectedRows: 1 }];
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app)
        .put("/api/admin/config")
        .send({ store_name: "Novo Nome" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { success: true } });
    });

    test("400: e-mail inválido em main_email retorna VALIDATION_ERROR", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config")
        .send({ main_email: "nao-e-email" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "main_email" }),
        ])
      );
    });

    test("400: campo desconhecido rejeitado por strict()", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config")
        .send({ campo_inexistente: "valor" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400: mp_auto_return com valor fora do enum", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config")
        .send({ mp_auto_return: "invalido" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /categories                                                     */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/config/categories", () => {
    test("200: retorna lista de categorias normalizada", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockResolvedValueOnce([
        [
          { id: 1, nome: "Rações", slug: "racoes", ativo: 1 },
          { id: 2, nome: "Vacinas", slug: "vacinas", ativo: 0 },
        ],
      ]);

      const res = await request(app).get("/api/admin/config/categories");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toEqual([
        { id: 1, nome: "Rações", slug: "racoes", ativo: true },
        { id: 2, nome: "Vacinas", slug: "vacinas", ativo: false },
      ]);
    });

    test("200: retorna array vazio quando não há categorias", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockResolvedValueOnce([[]]);

      const res = await request(app).get("/api/admin/config/categories");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  POST /categories                                                    */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/config/categories", () => {
    test("201: cria categoria com nome válido", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockResolvedValueOnce([{ insertId: 5 }]);

      const res = await request(app)
        .post("/api/admin/config/categories")
        .send({ nome: "Fertilizantes" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: { id: 5 } });
    });

    test("400: nome ausente retorna VALIDATION_ERROR", async () => {
      const { app } = setup();

      const res = await request(app)
        .post("/api/admin/config/categories")
        .send({ slug: "sem-nome" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "nome" }),
        ])
      );
    });

    test("400: nome vazio retorna VALIDATION_ERROR", async () => {
      const { app } = setup();

      const res = await request(app)
        .post("/api/admin/config/categories")
        .send({ nome: "" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500: erro no banco retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockRejectedValue(new Error("DB error"));

      const res = await request(app)
        .post("/api/admin/config/categories")
        .send({ nome: "Categoria X" });

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  PUT /categories/:id                                                 */
  /* ------------------------------------------------------------------ */

  describe("PUT /api/admin/config/categories/:id", () => {
    test("200: atualiza categoria existente", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .put("/api/admin/config/categories/3")
        .send({ nome: "Novo Nome", ativo: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, message: "Categoria atualizada." });
    });

    test("404: categoria inexistente retorna NOT_FOUND", async () => {
      const { app, poolMock } = setup();

      poolMock.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const res = await request(app)
        .put("/api/admin/config/categories/999")
        .send({ nome: "X" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("400: id inválido (texto) retorna VALIDATION_ERROR com field id", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config/categories/abc")
        .send({ nome: "X" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
    });

    test("400: id negativo retorna VALIDATION_ERROR", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config/categories/-5")
        .send({ nome: "X" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
    });

    test("400: nome vazio no body retorna VALIDATION_ERROR", async () => {
      const { app } = setup();

      const res = await request(app)
        .put("/api/admin/config/categories/1")
        .send({ nome: "" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });
  });
});
