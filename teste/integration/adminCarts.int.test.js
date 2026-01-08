/**
 * teste/integration/adminCarts.int.test.js
 *
 * Rotas testadas:
 * - GET    /api/admin/carrinhos
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

describe("AdminCarts routes (routes/adminCarts.js)", () => {
  const originalEnv = process.env;

  function setupModuleWithMocks() {
    jest.resetModules();

    // IMPORTANT: set env before requiring the router module
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ABANDON_CART_HOURS: "24",
      PUBLIC_SITE_URL: "http://localhost:3000/", // com "/" para validar trim
    };

    const mockConn = makeMockConn();

    const poolModulePath = require.resolve("../../config/pool");
    const verifyAdminModulePath = require.resolve("../../middleware/verifyAdmin");

    const poolMock = {
      getConnection: jest.fn().mockResolvedValue(mockConn),
    };

    const verifyAdminMock = jest.fn((req, res, next) => {
      // Simula admin autenticado
      req.user = { id: 999, role: "admin" };
      return next();
    });

    jest.doMock(poolModulePath, () => poolMock);
    jest.doMock(verifyAdminModulePath, () => verifyAdminMock);

    const router = require("../../routes/adminCarts");
    const app = makeTestApp("/api/admin/carrinhos", router);

    return { app, mockConn, poolMock, verifyAdminMock };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("GET /api/admin/carrinhos", () => {
    test("200: lista carrinhos abandonados e processa carrinhos abertos elegíveis (com itens)", async () => {
      // Arrange
      const { app, mockConn, poolMock, verifyAdminMock } = setupModuleWithMocks();

      const eligibleCarts = [{ id: 10, usuario_id: 7, created_at: "2026-01-01 10:00:00" }];

      const itensRows = [
        {
          produto_id: 42,
          produto: "Ração Premium 25kg",
          quantidade: 2,
          preco_unitario: 129.9,
        },
        {
          produto_id: 9,
          produto: "Coleira",
          quantidade: 1,
          preco_unitario: 0, // cobre branch de preço 0 válido
        },
      ];

      const rowsAbandoned = [
        {
          id: 1,
          carrinho_id: 10,
          usuario_id: 7,
          itens: JSON.stringify(itensRows.map((r) => ({
            produto_id: r.produto_id,
            produto: r.produto,
            quantidade: r.quantidade,
            preco_unitario: r.preco_unitario,
          }))),
          total_estimado: 259.8, // 2*129.9 + 1*0
          criado_em: "2026-01-01 10:00:00",
          atualizado_em: "2026-01-01 12:00:00",
          recuperado: 0,
          usuario_nome: "Fulano de Tal",
          usuario_email: "fulano@example.com",
          usuario_telefone: "(31) 99999-9999",
        },
      ];

      mockConn.query.mockImplementation(async (sql, params) => {
        // 1) busca carrinhos abertos elegíveis
        if (String(sql).includes("FROM carrinhos c") && String(sql).includes("c.status = 'aberto'")) {
          // valida que threshold foi aplicado (default 24h quando sem query.horas)
          expect(params).toEqual([24]);
          return [eligibleCarts];
        }

        // 2) busca itens do carrinho
        if (String(sql).includes("FROM carrinho_itens ci") && String(sql).includes("WHERE ci.carrinho_id = ?")) {
          expect(params).toEqual([10]);
          return [itensRows];
        }

        // 3) insere carrinho abandonado
        if (String(sql).includes("INSERT INTO carrinhos_abandonados")) {
          expect(params[0]).toBe(10); // carrinho_id
          expect(params[1]).toBe(7);  // usuario_id

          // itens JSON: não exige igualdade exata do string, mas valida estrutura mínima
          const json = params[2];
          const parsed = JSON.parse(json);
          expect(Array.isArray(parsed)).toBe(true);
          expect(parsed).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                produto_id: 42,
                produto: "Ração Premium 25kg",
                quantidade: 2,
                preco_unitario: 129.9,
              }),
            ])
          );

          // total_estimado
          expect(params[3]).toBeCloseTo(259.8, 6);

          // criado_em (usa cart.created_at)
          expect(params[4]).toBe("2026-01-01 10:00:00");

          return [{ insertId: 1 }];
        }

        // 4) agenda notificações (INSERT IGNORE ... VALUES ?)
        if (String(sql).includes("INSERT IGNORE INTO carrinhos_abandonados_notifications")) {
          // params: [values]
          expect(Array.isArray(params)).toBe(true);
          expect(Array.isArray(params[0])).toBe(true);
          // Cada linha: [abandonedId, tipo, scheduled_at(Date), status]
          expect(params[0][0][0]).toBe(1);
          expect(["whatsapp", "email"]).toContain(params[0][0][1]);
          expect(params[0][0][3]).toBe("pending");
          return [{ affectedRows: 3 }];
        }

        // 5) lista carrinhos abandonados com join no usuário
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("JOIN usuarios u")) {
          return [rowsAbandoned];
        }

        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos");

      // Assert
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(verifyAdminMock).toHaveBeenCalledTimes(1);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        carrinhos: [
          expect.objectContaining({
            id: 1,
            carrinho_id: 10,
            usuario_id: 7,
            usuario_nome: "Fulano de Tal",
            usuario_email: "fulano@example.com",
            usuario_telefone: "(31) 99999-9999",
            itens: expect.any(Array),
            total_estimado: 259.8,
            recuperado: false,
          }),
        ],
      });

      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: respeita query ?horas=2 (override do threshold)", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos c") && String(sql).includes("DATE_SUB(NOW(), INTERVAL ? HOUR)")) {
          expect(params).toEqual([2]);
          return [[]]; // nenhum carrinho elegível
        }

        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("JOIN usuarios u")) {
          return [[]];
        }

        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos?horas=2");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ carrinhos: [] });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: não insere carrinho abandonado quando carrinho elegível não tem itens", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      const eligibleCarts = [{ id: 11, usuario_id: 8, created_at: "2026-01-01 10:00:00" }];

      mockConn.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos c") && String(sql).includes("c.status = 'aberto'")) {
          return [eligibleCarts];
        }

        if (String(sql).includes("FROM carrinho_itens ci") && String(sql).includes("WHERE ci.carrinho_id = ?")) {
          return [[]]; // sem itens => deve dar continue (não inserte)
        }

        if (String(sql).includes("INSERT INTO carrinhos_abandonados")) {
          throw new Error("Não deveria inserir carrinhos_abandonados quando não há itens.");
        }

        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("JOIN usuarios u")) {
          return [[]];
        }

        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ carrinhos: [] });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: em erro inesperado, responde mensagem padronizada da rota", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos c")) {
          throw new Error("DB exploded");
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Erro ao buscar carrinhos abandonados" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/admin/carrinhos/:id/notificar", () => {
    test("400: ID inválido", async () => {
      // Arrange
      const { app, poolMock } = setupModuleWithMocks();

      // Act
      const res = await request(app).post("/api/admin/carrinhos/0/notificar").send({ tipo: "email" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("400: tipo inválido", async () => {
      // Arrange
      const { app, poolMock } = setupModuleWithMocks();

      // Act
      const res = await request(app).post("/api/admin/carrinhos/12/notificar").send({ tipo: "sms" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "tipo deve ser 'whatsapp' ou 'email'." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]]; // [[row]] = undefined
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).post("/api/admin/carrinhos/999/notificar").send({ tipo: "email" });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "Carrinho abandonado não encontrado." });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: não permite notificar carrinho recuperado", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1, usuario_id: 7, usuario_nome: "Fulano" }]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "whatsapp" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message:
          "Este carrinho já foi marcado como recuperado. Não é necessário enviar nova notificação.",
      });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: registra notificação manual (email) e retorna mensagem correta", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          expect(params).toEqual([1]);
          return [[
            {
              id: 1,
              carrinho_id: 10,
              usuario_id: 7,
              itens: "[]",
              total_estimado: 10,
              criado_em: "2026-01-01 10:00:00",
              recuperado: 0,
              usuario_nome: "Fulano de Tal",
              usuario_email: "fulano@example.com",
              usuario_telefone: "(31) 99999-9999",
            },
          ]];
        }

        if (String(sql).includes("INSERT INTO carrinhos_abandonados_notifications")) {
          // VALUES (?, ?, NOW(), 'pending')
          expect(params).toEqual([1, "email"]);
          return [{ insertId: 123 }];
        }

        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "email" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: "Notificação via email registrada e será enviada automaticamente pelo worker.",
      });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro ao registrar notificação", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 0, usuario_id: 7, usuario_nome: "Fulano" }]];
        }

        if (String(sql).includes("INSERT INTO carrinhos_abandonados_notifications")) {
          throw new Error("insert failed");
        }

        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).post("/api/admin/carrinhos/1/notificar").send({ tipo: "whatsapp" });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Erro ao notificar carrinho abandonado" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/admin/carrinhos/:id/whatsapp-link", () => {
    test("400: ID inválido", async () => {
      // Arrange
      const { app, poolMock } = setupModuleWithMocks();

      // Act
      const res = await request(app).get("/api/admin/carrinhos/0/whatsapp-link");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: carrinho abandonado não encontrado", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[undefined]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/999/whatsapp-link");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "Carrinho abandonado não encontrado." });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: bloqueia se recuperado", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 1 }]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "Este carrinho já foi marcado como recuperado." });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400: bloqueia se não há telefone", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[{ id: 1, recuperado: 0, usuario_nome: "Fulano", usuario_telefone: "" }]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "Usuário não possui telefone cadastrado." });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: gera wa.me link com DDI 55, texto com itens + total + recovery link", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      const itensSnapshot = [
        { produto_id: 42, produto: "Ração Premium 25kg", quantidade: 2, preco_unitario: 129.9 },
      ];

      mockConn.query.mockImplementation(async (sql, params) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          expect(params).toEqual([1]);

          return [[
            {
              id: 1,
              carrinho_id: 10,
              usuario_id: 7,
              itens: JSON.stringify(itensSnapshot),
              total_estimado: 259.8,
              recuperado: 0,
              usuario_nome: "Fulano de Tal",
              usuario_telefone: "(31) 99999-9999",
            },
          ]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      // Assert
      expect(res.status).toBe(200);

      expect(res.body).toEqual({
        wa_link: expect.any(String),
        message_text: expect.any(String),
      });

      // wa.me com telefone normalizado (55 + dígitos)
      expect(res.body.wa_link).toMatch(/^https:\/\/wa\.me\/55\d+\?text=/);

      // texto contém itens e total formatado em pt-BR (R$)
      expect(res.body.message_text).toContain("Olá Fulano!");
      expect(res.body.message_text).toContain("Percebemos que você deixou estes itens no carrinho:");
      expect(res.body.message_text).toContain("- 2x Ração Premium 25kg");
      expect(res.body.message_text).toContain("Total estimado:");

      // recovery link: PUBLIC_SITE_URL com trim de "/" + checkout?cartId=...
      expect(res.body.message_text).toContain("Finalizar em 1 clique:");
      expect(res.body.message_text).toContain("http://localhost:3000/checkout?cartId=10");

      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("200: se PUBLIC_SITE_URL vazio, não inclui recovery link no texto", async () => {
      // Arrange
      jest.resetModules();
      process.env = { ...originalEnv, NODE_ENV: "test", PUBLIC_SITE_URL: "" };

      const mockConn = makeMockConn();
      const poolModulePath = require.resolve("../../config/pool");
      const verifyAdminModulePath = require.resolve("../../middleware/verifyAdmin");

      const poolMock = { getConnection: jest.fn().mockResolvedValue(mockConn) };
      jest.doMock(poolModulePath, () => poolMock);
      jest.doMock(verifyAdminModulePath, () => (req, res, next) => next());

      const router = require("../../routes/adminCarts");
      const app = makeTestApp("/api/admin/carrinhos", router);

      mockConn.query.mockImplementation(async (sql) => {
        if (String(sql).includes("FROM carrinhos_abandonados ca") && String(sql).includes("WHERE ca.id = ?")) {
          return [[
            {
              id: 1,
              carrinho_id: 10,
              itens: "[]",
              total_estimado: 0,
              recuperado: 0,
              usuario_nome: "Fulano de Tal",
              usuario_telefone: "31999999999",
            },
          ]];
        }
        throw new Error(`SQL não mapeado no mock: ${sql}`);
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.message_text).toContain("Total estimado:");
      expect(res.body.message_text).not.toContain("Finalizar em 1 clique:");
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro ao gerar link", async () => {
      // Arrange
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockImplementation(async () => {
        throw new Error("DB fail");
      });

      // Act
      const res = await request(app).get("/api/admin/carrinhos/1/whatsapp-link");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Erro ao gerar link de WhatsApp" });
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });
});
