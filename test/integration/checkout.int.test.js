// test/integration/checkout.int.test.js

const request = require("supertest");
const { makeTestApp } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("Checkout Routes (integration)", () => {
  // Paths resolvidos: garante que o mock bate com o require interno da rota
  const poolPath = require.resolve("../../config/pool");
  const controllerPath = require.resolve("../../controllers/checkoutController");
  const authPath = require.resolve("../../middleware/authenticateToken");
  const csrfPath = require.resolve("../../middleware/csrfProtection");
  const shippingSvcPath = require.resolve("../../services/shippingQuoteService");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const routerPath = require.resolve("../../routes/ecommerce/checkout");

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

    // AppError compatível com a rota — inclui details para erros de validação Zod
    jest.doMock(appErrorPath, () => {
      return class AppError extends Error {
        constructor(message, code, status, details) {
          super(message);
          this.name = "AppError";
          this.code = code;
          this.status = status;
          if (details !== undefined && details !== null) {
            this.details = details;
          }
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

    // CSRF: bypass — não é o que está sendo testado aqui
    jest.doMock(csrfPath, () => ({
      validateCSRF: (_req, _res, next) => next(),
      generateCSRFToken: jest.fn(),
    }));

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
      const defaultCreate = function checkoutController(_req, res) {
        return res.status(201).json({
          success: true,
          message: "Pedido criado com sucesso",
          pedido_id: 123,
          total: 150.5,
        });
      };
      return {
        create: defaultCreate,
        previewCoupon: jest.fn((_req, res) => res.status(200).json({ ok: true })),
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

      // Assert — validate() retorna "Dados inválidos." no message;
      // os erros de campo ficam em details.fields (ver middleware/validate.js)
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      const fields = res.body.details?.fields || [];
      const messages = fields.map((f) => f.message).join(" ");
      expect(messages).toContain("endereco é obrigatório");
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

      // Assert — erros de campo em details.fields, não em message
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      const fields = res.body.details?.fields || [];
      const messages = fields.map((f) => f.message).join(" ");
      expect(messages).toContain("endereco.rua é obrigatório");
      expect(messages).toContain("endereco.bairro é obrigatório");
      expect(messages).toContain("endereco.numero é obrigatório");
    });

    test("201 ENTREGA URBANA com sem_numero=true normaliza numero='S/N' e passa shipping ao controller", async () => {
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

      // Act
      const res = await request(app).post("/api/checkout").send({
        // entrega_tipo ausente => default ENTREGA (normalizeEntregaTipo)
        formaPagamento: "Pix",
        endereco: {
          tipo_localidade: "URBANA",
          cep: "36940-000",
          cidade: "Manhuaçu",
          estado: "mg",
          rua: "Rua A",
          bairro: "Centro",
          sem_numero: true,
          // numero ausente => vira "S/N" pelo schema
        },
        produtos: [{ id: 1, quantidade: 2 }],
      });

      // Assert: mock controller retornou 201 com sucesso
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("pedido_id", 123);

      // recalcShippingMiddleware chamou getQuote (ENTREGA)
      expect(shippingSvc.getQuote).toHaveBeenCalledTimes(1);
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

    test("201 RETIRADA: não exige endereco e não chama getQuote", async () => {
      // Arrange
      const { shippingSvc } = loadAppWithMocks();

      // Act
      const res = await request(app).post("/api/checkout").send({
        entrega_tipo: "RETIRADA",
        formaPagamento: "Pix",
        produtos: [{ id: 1, quantidade: 1 }],
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // RETIRADA não chama o serviço de frete
      expect(shippingSvc.getQuote).not.toHaveBeenCalled();
    });

    // SKIP: Testava o comportamento do middleware persistShippingOnResponse (removido).
    // A persistência de shipping agora acontece dentro de checkoutService.create() via
    // transação — coberta pelos testes de integração de controllers/checkout.int.test.js.
    test.skip("500 se falhar ao persistir shipping_* (comportamento do middleware removido)", () => {});
  });

  // SKIP: Os testes abaixo foram escritos para uma versão antiga da API preview-cupom
  // que aceitava `total` (subtotal calculado no cliente). A API atual exige `produtos`
  // (array de itens) e computa o subtotal no servidor para garantir integridade de preço.
  // Reescrever com `produtos`, duplo mock de pool.query (product_prices + cupons)
  // e usar controllerImpl apontando para o controller real.
  describe("POST /api/checkout/preview-cupom", () => {
    test.skip("400 se codigo ausente", async () => {
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

    test.skip("400 se total inválido", async () => {
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

    test.skip("400 se cupom não encontrado", async () => {
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

    test.skip("400 se cupom inativo", async () => {
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

    test.skip("400 se cupom expirado", async () => {
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

    test.skip("400 se atingiu max_usos", async () => {
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

    test.skip("400 se subtotal abaixo do mínimo", async () => {
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

    test.skip("200 sucesso percentual", async () => {
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

    test.skip("200 sucesso fixo com clamp (desconto não pode exceder total)", async () => {
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

    test.skip("500 quando pool.query falha (SERVER_ERROR)", async () => {
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
