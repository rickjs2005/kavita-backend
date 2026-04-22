/**
 * test/integration/adminCarts.int.test.js
 *
 * Rotas testadas:
 * - POST   /api/admin/carrinhos/scan        (escaneia carrinhos abertos)
 * - GET    /api/admin/carrinhos             (lista carrinhos abandonados)
 * - POST   /api/admin/carrinhos/:id/notificar
 * - GET    /api/admin/carrinhos/:id/whatsapp-link
 *
 * Regras:
 * - Sem MySQL real (pool.query mockado diretamente — sem getConnection/conn)
 * - Sem rede externa
 * - Auth mock (verifyAdmin)
 * - Arrange -> Act -> Assert
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("AdminCarts routes (routes/admin/adminCarts.js)", () => {
  const originalEnv = process.env;

  function setupModuleWithMocks(envOverrides = {}) {
    jest.resetModules();

    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ABANDON_CART_HOURS: "24",
      PUBLIC_SITE_URL: "http://localhost:3000/",
      ...envOverrides,
    };

    // abandonedCartsRepository usa pool.query diretamente — sem getConnection
    const poolMock = {
      query: jest.fn(),
    };

    const verifyAdminMock = jest.fn((req, _res, next) => {
      req.user = { id: 999, role: "admin" };
      return next();
    });

    jest.doMock(require.resolve("../../config/pool"), () => poolMock);
    jest.doMock(require.resolve("../../middleware/verifyAdmin"), () => verifyAdminMock);

    const router = require("../../routes/admin/adminCarts");
    const app = makeTestApp("/api/admin/carrinhos", router);

    return { app, poolMock, verifyAdminMock };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  /* ------------------------------------------------------------------ */
  /*  POST /scan                                                          */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/carrinhos/scan", () => {
    test("200: escaneia carrinhos elegíveis e agenda notificações", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const eligibleCarts = [{ id: 10, usuario_id: 7, created_at: "2026-01-01 10:00:00" }];
      const itensRows = [
        { produto_id: 42, produto: "Ração Premium 25kg", quantidade: 2, preco_unitario: 129.9 },
        { produto_id: 9,  produto: "Coleira",            quantidade: 1, preco_unitario: 0 },
      ];

      poolMock.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos c") && String(sql).includes("c.status = 'aberto'")) {
          expect(params).toEqual([24]);
          return [eligibleCarts];
        }
        if (String(sql).includes("FROM carrinho_itens ci")) {
          expect(params).toEqual([10]);
          return [itensRows];
        }
        if (String(sql).includes("INSERT INTO carrinhos_abandonados")) {
          expect(params[0]).toBe(10);
          expect(params[1]).toBe(7);
          const parsed = JSON.parse(params[2]);
          expect(Array.isArray(parsed)).toBe(true);
          expect(parsed).toEqual(expect.arrayContaining([
            expect.objectContaining({ produto_id: 42, quantidade: 2 }),
          ]));
          expect(params[3]).toBeCloseTo(259.8, 6);
          return [{ insertId: 1 }];
        }
        if (String(sql).includes("INSERT IGNORE INTO carrinhos_abandonados_notifications")) {
          // params = [notifications] onde notifications é array de tuplas
          expect(Array.isArray(params)).toBe(true);
          expect(params[0][0][0]).toBe(1);                              // abandonedId
          expect(["whatsapp", "email"]).toContain(params[0][0][1]);     // tipo
          expect(params[0][0][3]).toBe("pending");                      // status
          return [{ affectedRows: 3 }];
        }
        if (String(sql).includes("INSERT INTO admin_audit_logs")) {
          // Audit fire-and-forget — aceita sem asserir.
          return [{ insertId: 999 }];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: { candidates: 1, inserted: 1, skippedEmpty: 0, minHours: 24 },
      });
    });

    test("200: não insere quando carrinho elegível não tem itens", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos c")) return [[{ id: 11, usuario_id: 8, created_at: "2026-01-01" }]];
        if (String(sql).includes("FROM carrinho_itens ci")) return [[]];
        if (String(sql).includes("INSERT INTO carrinhos_abandonados")) throw new Error("Não deveria inserir sem itens");
        if (String(sql).includes("INSERT INTO admin_audit_logs")) return [{ insertId: 999 }];
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: { candidates: 1, inserted: 0, skippedEmpty: 1, minHours: 24 },
      });
    });

    test("200: respeita horas=2 no body (threshold customizado)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos c")) {
          expect(params).toEqual([2]); // threshold vindo do body
          return [[]];
        }
        if (String(sql).includes("INSERT INTO admin_audit_logs")) return [{ insertId: 999 }];
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/scan").send({ horas: 2 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: { candidates: 0, inserted: 0, minHours: 2 },
      });
    });

    test("400: horas=0 rejeitado pelo schema (mínimo é 1)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/scan").send({ horas: 0 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("400: horas=721 rejeitado pelo schema (máximo é 720)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/scan").send({ horas: 721 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("500: erro na query retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /                                                               */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/carrinhos", () => {
    test("200: lista carrinhos abandonados catalogados", async () => {
      const { app, poolMock, verifyAdminMock } = setupModuleWithMocks();

      const rowsAbandoned = [
        {
          id: 1,
          carrinho_id: 10,
          usuario_id: 7,
          itens: JSON.stringify([{ produto_id: 42, produto: "Ração", quantidade: 2, preco_unitario: 129.9 }]),
          total_estimado: 259.8,
          criado_em: "2026-01-01 10:00:00",
          atualizado_em: "2026-01-01 12:00:00",
          recuperado: 0,
          usuario_nome: "Fulano de Tal",
          usuario_email: "fulano@example.com",
          usuario_telefone: "(31) 99999-9999",
        },
      ];

      poolMock.query.mockResolvedValue([rowsAbandoned]);

      const res = await request(app).get("/api/admin/carrinhos");

      expect(verifyAdminMock).toHaveBeenCalledTimes(1);
      expect(poolMock.query).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: {
          carrinhos: [
            expect.objectContaining({
              id: 1,
              carrinho_id: 10,
              usuario_nome: "Fulano de Tal",
              total_estimado: 259.8,
              recuperado: false,
            }),
          ],
        },
      });
    });

    test("200: lista vazia quando não há carrinhos abandonados", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockResolvedValue([[]]);

      const res = await request(app).get("/api/admin/carrinhos");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { carrinhos: [] } });
    });

    test("500: erro inesperado retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app).get("/api/admin/carrinhos");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  POST /:id/notificar                                                 */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/carrinhos/:id/notificar", () => {
    test("400: ID inválido (id=0) — sem query ao banco", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/0/notificar").send({ tipo: "email" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("400: ID negativo rejeitado pelo schema", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/-1/notificar").send({ tipo: "email" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("400: tipo inválido — sem query ao banco", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/12/notificar").send({ tipo: "sms" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/999/notificar").send({ tipo: "email" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("400: não permite notificar carrinho recuperado", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1, usuario_id: 7, usuario_nome: "Fulano" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "whatsapp" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("200: registra notificação manual (email)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          expect(params).toEqual([1]);
          return [[{ id: 1, carrinho_id: 10, usuario_id: 7, itens: "[]", total_estimado: 10, criado_em: "2026-01-01", recuperado: 0, usuario_nome: "Fulano", usuario_email: "f@e.com", usuario_telefone: "31999999999" }]];
        }
        if (String(sql).includes("INSERT INTO carrinhos_abandonados_notifications")) {
          expect(params).toEqual([1, "email"]);
          return [{ insertId: 123 }];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "email" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, message: expect.stringContaining("email") });
    });

    test("500: erro ao registrar notificação", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 0, usuario_id: 7, usuario_nome: "Fulano" }]];
        }
        if (String(sql).includes("INSERT INTO carrinhos_abandonados_notifications")) {
          throw new Error("insert failed");
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "whatsapp" });

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /:id/whatsapp-link                                             */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/carrinhos/:id/whatsapp-link", () => {
    test("400: ID inválido (id=0) — sem query ao banco", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).get("/api/admin/carrinhos/0/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/999/whatsapp-link");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("400: bloqueia se recuperado", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1 }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400: bloqueia se sem telefone", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 0, usuario_nome: "Fulano", usuario_telefone: "" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringContaining("telefone") });
    });

    test("200: gera wa.me link com DDI 55 + texto com recovery link", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const itensSnapshot = [
        { produto_id: 42, produto: "Ração Premium 25kg", quantidade: 2, preco_unitario: 129.9 },
      ];

      poolMock.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          expect(params).toEqual([1]);
          return [[{
            id: 1,
            carrinho_id: 10,
            usuario_id: 7,
            itens: JSON.stringify(itensSnapshot),
            total_estimado: 259.8,
            recuperado: 0,
            usuario_nome: "Fulano de Tal",
            usuario_telefone: "(31) 99999-9999",
          }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { wa_link: expect.any(String), message_text: expect.any(String) } });
      expect(res.body.data.wa_link).toMatch(/^https:\/\/wa\.me\/55\d+\?text=/);
      expect(res.body.data.message_text).toContain("Olá Fulano!");
      expect(res.body.data.message_text).toContain("- 2x Ração Premium 25kg");
      expect(res.body.data.message_text).toContain("http://localhost:3000/checkout?cartId=10");
    });

    test("200: sem PUBLIC_SITE_URL — não inclui recovery link", async () => {
      const { app, poolMock } = setupModuleWithMocks({ PUBLIC_SITE_URL: "" });

      poolMock.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, carrinho_id: 10, itens: "[]", total_estimado: 0, recuperado: 0, usuario_nome: "Fulano", usuario_telefone: "31999999999" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(200);
      expect(res.body.data.message_text).toContain("Total estimado:");
      expect(res.body.data.message_text).not.toContain("Finalizar em 1 clique:");
    });

    test("500: erro de banco retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockRejectedValue(new Error("DB fail"));

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });
});
