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
 * - Sem MySQL real (mock pool/getConnection/conn.query)
 * - Sem rede externa
 * - Auth mock (verifyAdmin)
 * - Arrange -> Act -> Assert
 */

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");

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

    const mockConn = makeMockConn();

    const poolModulePath = require.resolve("../../config/pool");
    const verifyAdminModulePath = require.resolve("../../middleware/verifyAdmin");

    const poolMock = {
      getConnection: jest.fn().mockResolvedValue(mockConn),
    };

    const verifyAdminMock = jest.fn((req, res, next) => {
      req.user = { id: 999, role: "admin" };
      return next();
    });

    jest.doMock(poolModulePath, () => poolMock);
    jest.doMock(verifyAdminModulePath, () => verifyAdminMock);

    const router = require("../../routes/admin/adminCarts");
    const app = makeTestApp("/api/admin/carrinhos", router);

    return { app, mockConn, poolMock, verifyAdminMock };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  /* ------------------------------------------------------------------ */
  /*  POST /scan                                                          */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/carrinhos/scan", () => {
    test("200: escaneia carrinhos elegíveis e agenda notificações", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      const eligibleCarts = [{ id: 10, usuario_id: 7, created_at: "2026-01-01 10:00:00" }];
      const itensRows = [
        { produto_id: 42, produto: "Ração Premium 25kg", quantidade: 2, preco_unitario: 129.9 },
        { produto_id: 9, produto: "Coleira", quantidade: 1, preco_unitario: 0 },
      ];

      mockConn.query.mockImplementation(async (sql, params) => {
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
          expect(Array.isArray(params)).toBe(true);
          expect(params[0][0][0]).toBe(1);
          expect(["whatsapp", "email"]).toContain(params[0][0][1]);
          expect(params[0][0][3]).toBe("pending");
          return [{ affectedRows: 3 }];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { scanned: 1 } });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: não insere quando carrinho elegível não tem itens", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos c")) return [[{ id: 11, usuario_id: 8, created_at: "2026-01-01" }]];
        if (String(sql).includes("FROM carrinho_itens ci")) return [[]];
        if (String(sql).includes("INSERT INTO carrinhos_abandonados")) throw new Error("Não deveria inserir sem itens");
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { scanned: 0 } });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro inesperado retorna SERVER_ERROR", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app).post("/api/admin/carrinhos/scan").send({});

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /                                                               */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/carrinhos", () => {
    test("200: lista carrinhos abandonados catalogados", async () => {
      const { app, mockConn, poolMock, verifyAdminMock } = setupModuleWithMocks();

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

      mockConn.query.mockResolvedValue([rowsAbandoned]);

      const res = await request(app).get("/api/admin/carrinhos");

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(verifyAdminMock).toHaveBeenCalledTimes(1);
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
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: respeita query ?horas=2 (não afeta GET, só scan)", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockResolvedValue([[]]);

      const res = await request(app).get("/api/admin/carrinhos?horas=2");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: { carrinhos: [] } });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro inesperado retorna SERVER_ERROR", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app).get("/api/admin/carrinhos");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  POST /:id/notificar                                                 */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/carrinhos/:id/notificar", () => {
    test("400: ID inválido (id=0)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/0/notificar").send({ tipo: "email" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("400: tipo inválido", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).post("/api/admin/carrinhos/12/notificar").send({ tipo: "sms" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/999/notificar").send({ tipo: "email" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: não permite notificar carrinho recuperado", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1, usuario_id: 7, usuario_nome: "Fulano" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "whatsapp" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: registra notificação manual (email)", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql, params) => {
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
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro ao registrar notificação", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
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
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /:id/whatsapp-link                                             */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/carrinhos/:id/whatsapp-link", () => {
    test("400: ID inválido (id=0)", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).get("/api/admin/carrinhos/0/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/999/whatsapp-link");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: bloqueia se recuperado", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1 }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: bloqueia se sem telefone", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 0, usuario_nome: "Fulano", usuario_telefone: "" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringContaining("telefone") });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: gera wa.me link com DDI 55 + texto com recovery link", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      const itensSnapshot = [
        { produto_id: 42, produto: "Ração Premium 25kg", quantidade: 2, preco_unitario: 129.9 },
      ];

      mockConn.query.mockImplementation(async (sql, params) => {
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
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: sem PUBLIC_SITE_URL — não inclui recovery link", async () => {
      const { app, mockConn } = setupModuleWithMocks({ PUBLIC_SITE_URL: "" });

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, carrinho_id: 10, itens: "[]", total_estimado: 0, recuperado: 0, usuario_nome: "Fulano", usuario_telefone: "31999999999" }]];
        }
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(200);
      expect(res.body.data.message_text).toContain("Total estimado:");
      expect(res.body.data.message_text).not.toContain("Finalizar em 1 clique:");
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro de banco retorna SERVER_ERROR", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockRejectedValue(new Error("DB fail"));

      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });
});
