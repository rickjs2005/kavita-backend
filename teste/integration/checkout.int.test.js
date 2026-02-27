// teste/integration/checkout.int.test.js

const request = require("supertest");
const { makeTestApp } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("Checkout Routes (integration)", () => {
  // Paths resolvidos: garante que o mock bate com o require interno da rota
  const poolPath = require.resolve("../../config/pool");
  const controllerPath = require.resolve("../../controllers/checkoutController");
  const authPath = require.resolve("../../middleware/authenticateToken");
  const shippingSvcPath = require.resolve("../../services/shippingQuoteService");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const routerPath = require.resolve("../../routes/checkoutRoutes");

  let pool;
  let app;

  function loadAppWithMocks({
    authUser = { id: 99, role: "user" },
    controllerImpl,
    getQuoteImpl,
    parseCepImpl,
    normalizeItemsImpl,
  } = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    // pool mock (sem MySQL real)
    const mockPool = makeMockPool();
    jest.doMock(poolPath, () => mockPool);

    // ErrorCodes (precisa ter pelo menos os usados na rota)
    jest.doMock(errorCodesPath, () => ({
      VALIDATION_ERROR: "VALIDATION_ERROR",
      SERVER_ERROR: "SERVER_ERROR",
      AUTH_ERROR: "AUTH_ERROR",
      NOT_FOUND: "NOT_FOUND",
    }));

    // AppError compatível com a rota
    jest.doMock(appErrorPath, () => {
      return class AppError extends Error {
        constructor(message, code, status) {
          super(message);
          this.name = "AppError";
          this.code = code;
          this.status = status;
        }
      };
    });

    // Auth: injeta req.user ou retorna 401
    jest.doMock(authPath, () => {
      return function authenticateToken(req, _res, next) {
        if (!authUser) {
          const AppError = require(appErrorPath);
          const ERROR_CODES = require(errorCodesPath);
          return next(new AppError("Token não fornecido.", ERROR_CODES.AUTH_ERROR, 401));
        }
        req.user = authUser;
        return next();
      };
    });

    // shippingQuoteService mocks
    jest.doMock(shippingSvcPath, () => {
      return {
        getQuote: jest.fn(getQuoteImpl || (async () => ({ cep: "36940000", price: 20, prazo_dias: 5, ruleApplied: "ZONE", freeItems: [] }))),
        parseCep: jest.fn(parseCepImpl || ((raw) => String(raw || "").replace(/\D/g, ""))),
        normalizeItems: jest.fn(normalizeItemsImpl || ((items) => items)),
      };
    });

    // checkoutController mock (precisa devolver pedido_id para o persistShippingOnResponse rodar)
    jest.doMock(controllerPath, () => {
      if (controllerImpl) return controllerImpl;
      return function checkoutController(_req, res) {
        return res.status(201).json({
          success: true,
          message: "Pedido criado com sucesso",
          pedido_id: 123,
          total: 150.5,
        });
      };
    });

    const router = require(routerPath);
    pool = require(poolPath);

    app = makeTestApp("/api/checkout", router);

    return { app, pool, shippingSvc: require(shippingSvcPath) };
  }

  describe("POST /api/checkout (pedido)", () => {
    test("401 quando usuário não autenticado (token ausente)", async () => {
      // Arrange
      loadAppWithMocks({ authUser: null });

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "ENTREGA",
        formaPagamento: "Pix",
        endereco: { cep: "36940000" },
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(401);
      // O erro vem do middleware auth mockado. Seu app real provavelmente padroniza.
      // Como makeTestApp geralmente tem handler, validamos o mínimo contrato.
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");
    });

    test("400 ENTREGA sem endereco => validação", async () => {
      // Arrange
      loadAppWithMocks();

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "ENTREGA",
        formaPagamento: "Pix",
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(String(res.body.message)).toContain("endereco é obrigatório");
    });

    test("400 ENTREGA URBANA: exige rua/bairro/numero (quando sem_numero=false)", async () => {
      // Arrange
      loadAppWithMocks();

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "ENTREGA",
        formaPagamento: "Pix",
        endereco: {
          tipo_localidade: "URBANA",
          cep: "36940000",
          cidade: "Manhuaçu",
          estado: "MG",
          rua: "", // faltando
          bairro: "", // faltando
          numero: "", // faltando
        },
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("endereco.rua é obrigatório");
      expect(String(res.body.message)).toContain("endereco.bairro é obrigatório");
      expect(String(res.body.message)).toContain("endereco.numero é obrigatório");
    });

    test("201 ENTREGA URBANA com sem_numero=true normaliza numero='S/N' e persiste shipping_* no pedido", async () => {
      // Arrange
      const { shippingSvc } = loadAppWithMocks({
        getQuoteImpl: async () => ({
          cep: "36940000",
          price: 12.34,
          prazo_dias: 7,
          ruleApplied: "MG-ZONE",
          freeItems: [{ id: 1 }],
        }),
      });

      // Persist update no pedido
      pool.query.mockResolvedValueOnce([{}]); // UPDATE pedidos ...

      // Act
      const res = await request(app).post("/api/checkout").send({
        // entrega_tipo ausente => default ENTREGA (seu normalizeEntregaTipo)
        formaPagamento: "Pix",
        endereco: {
          tipo_localidade: "URBANA",
          cep: "36940-000",
          cidade: "Manhuaçu",
          estado: "mg",
          rua: "Rua A",
          bairro: "Centro",
          sem_numero: true,
          // numero ausente intencionalmente => vira "S/N"
        },
        produtos: [{ id: 1, quantidade: 2 }],
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("pedido_id", 123);

      // NF aviso sempre injetado pelo persistShippingOnResponse
      expect(res.body.nota_fiscal_aviso).toBe("Nota fiscal será entregue junto com o produto.");

      // getQuote foi chamado (ENTREGA)
      expect(shippingSvc.getQuote).toHaveBeenCalledTimes(1);

      // Persistiu shipping_* com pedido_id=123
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(String(sql)).toContain("UPDATE pedidos");
      expect(params).toEqual([
        12.34,
        "MG-ZONE",
        7,
        "36940000",
        123,
      ]);
    });

    test("400 ENTREGA: CEP inválido para frete => VALIDATION_ERROR (recalcShippingMiddleware)", async () => {
      // Arrange
      loadAppWithMocks({
        parseCepImpl: () => "123", // força inválido
      });

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "ENTREGA",
        formaPagamento: "Pix",
        endereco: {
          tipo_localidade: "URBANA",
          cep: "123",
          cidade: "Manhuaçu",
          estado: "MG",
          rua: "Rua A",
          bairro: "Centro",
          numero: "10",
        },
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("CEP inválido");
    });

    test("201 RETIRADA: não exige endereco, não chama getQuote, força frete=0 e prazo null, e persiste PICKUP", async () => {
      // Arrange
      const { shippingSvc } = loadAppWithMocks();

      pool.query.mockResolvedValueOnce([{}]); // UPDATE pedidos

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "RETIRADA",
        formaPagamento: "Pix",
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.nota_fiscal_aviso).toBe("Nota fiscal será entregue junto com o produto.");

      // RETIRADA não calcula frete
      expect(shippingSvc.getQuote).not.toHaveBeenCalled();

      // Persiste shipping_* com PICKUP
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [, params] = pool.query.mock.calls[0];
      expect(params).toEqual([0, "PICKUP", null, null, 123]);
    });

    test("500 se falhar ao persistir shipping_* (consistência: não devolve sucesso sem persistir)", async () => {
      // Arrange
      loadAppWithMocks();

      pool.query.mockRejectedValueOnce(new Error("Unknown column 'shipping_price'"));

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "RETIRADA",
        formaPagamento: "Pix",
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        success: false,
      });
      expect(String(res.body.message)).toContain("falhou ao persistir");
      expect(res.body.nota_fiscal_aviso).toBe("Nota fiscal será entregue junto com o produto.");
    });
  });

  describe("POST /api/checkout/preview-cupom", () => {
    test("400 se codigo ausente", async () => {
      // Arrange
      loadAppWithMocks();

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("Informe o código do cupom");
    });

    test("400 se total inválido", async () => {
      // Arrange
      loadAppWithMocks();

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 0,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("Total inválido");
    });

    test("400 se cupom não encontrado", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([[]]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "INEXISTENTE",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("Cupom inválido");
    });

    test("400 se cupom inativo", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          codigo: "PROMO10",
          tipo: "percentual",
          valor: 10,
          minimo: 0,
          expiracao: null,
          usos: 0,
          max_usos: null,
          ativo: 0,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("inativo");
    });

    test("400 se cupom expirado", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          codigo: "PROMO10",
          tipo: "percentual",
          valor: 10,
          minimo: 0,
          expiracao: "2000-01-01T00:00:00.000Z",
          usos: 0,
          max_usos: null,
          ativo: 1,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("expirado");
    });

    test("400 se atingiu max_usos", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          codigo: "PROMO10",
          tipo: "percentual",
          valor: 10,
          minimo: 0,
          expiracao: null,
          usos: 5,
          max_usos: 5,
          ativo: 1,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("limite de usos");
    });

    test("400 se subtotal abaixo do mínimo", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          codigo: "PROMO10",
          tipo: "percentual",
          valor: 10,
          minimo: 200,
          expiracao: null,
          usos: 0,
          max_usos: null,
          ativo: 1,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("valor mínimo");
    });

    test("200 sucesso percentual", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          codigo: "PROMO10",
          tipo: "percentual",
          valor: 10,
          minimo: 0,
          expiracao: null,
          usos: 0,
          max_usos: null,
          ativo: 1,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 200,
      });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.desconto).toBe(20);
      expect(res.body.total_original).toBe(200);
      expect(res.body.total_com_desconto).toBe(180);
      expect(res.body.cupom).toMatchObject({ codigo: "PROMO10", tipo: "percentual", valor: 10 });
    });

    test("200 sucesso fixo com clamp (desconto não pode exceder total)", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockResolvedValueOnce([
        [{
          id: 2,
          codigo: "FIXO500",
          tipo: "fixo",
          valor: 500,
          minimo: 0,
          expiracao: null,
          usos: 0,
          max_usos: null,
          ativo: 1,
        }],
      ]);

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "FIXO500",
        total: 120,
      });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.desconto).toBe(120);
      expect(res.body.total_com_desconto).toBe(0);
    });

    test("500 quando pool.query falha (SERVER_ERROR)", async () => {
      // Arrange
      loadAppWithMocks();
      pool.query.mockRejectedValueOnce(new Error("db down"));

      // Act
      const res = await request(app).post("/api/checkout/preview-cupom").send({
        codigo: "PROMO10",
        total: 100,
      });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("SERVER_ERROR");
      expect(String(res.body.message)).toContain("Erro ao validar o cupom");
    });
  });
});
