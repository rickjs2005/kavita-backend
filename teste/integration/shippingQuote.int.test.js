// teste/integration/shippingQuote.int.test.js

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Shipping Routes (integration)", () => {
  const routerPath = require.resolve("../../routes/shippingRoutes");
  const svcPath = require.resolve("../../services/shippingQuoteService");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");

  let app;
  let getQuoteMock;

  function loadAppWithMocks({ getQuoteImpl } = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    // ErrorCodes: shippingRoutes usa INVALID_INPUT e SERVER_ERROR.
    jest.doMock(errorCodesPath, () => ({
      INVALID_INPUT: "INVALID_INPUT",
      SERVER_ERROR: "SERVER_ERROR",
    }));

    // AppError compatível
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

    // Service central (mocka getQuote)
    getQuoteMock = jest.fn(
      getQuoteImpl ||
        (async () => ({
          cep: "36940000",
          price: 19.9,
          prazo_dias: 5,
          is_free: false,
          ruleApplied: "ZONE",
          freeItems: [],
          zone: { id: 1, name: "MG - Zona A" },
        }))
    );

    jest.doMock(svcPath, () => ({
      getQuote: (...args) => getQuoteMock(...args),
    }));

    const router = require(routerPath);
    app = makeTestApp("/api/shipping", router);

    return { app };
  }

  beforeEach(() => {
    loadAppWithMocks();
  });

  describe("GET /api/shipping/quote", () => {
    test("200 sucesso: valida parseCep + parseItems e repassa quote do service", async () => {
      // Arrange
      const items = [{ id: 1, quantidade: 2 }];
      const itemsStr = JSON.stringify(items);

      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: itemsStr });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toMatchObject({
        cep: "36940000",
        price: 19.9,
        prazo_dias: 5,
        is_free: false,
        ruleApplied: "ZONE",
      });

      // getQuote deve receber cep sem máscara e items normalizados
      expect(getQuoteMock).toHaveBeenCalledTimes(1);
      expect(getQuoteMock).toHaveBeenCalledWith({
        cep: "36940000",
        items: [{ id: 1, quantidade: 2 }],
      });
    });

    test("400 CEP inválido (len != 8) => INVALID_INPUT", async () => {
      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "123", items: JSON.stringify([{ id: 1, quantidade: 1 }]) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(String(res.body.message)).toContain("CEP inválido");
      expect(getQuoteMock).not.toHaveBeenCalled();
    });

    test("400 items inválido (JSON malformado)", async () => {
      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: "[{]" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
      expect(String(res.body.message)).toContain("Parâmetro 'items' inválido");
      expect(getQuoteMock).not.toHaveBeenCalled();
    });

    test("400 items vazio (array vazio) => carrinho vazio", async () => {
      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: "[]" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
      expect(String(res.body.message)).toContain("Carrinho vazio");
      expect(getQuoteMock).not.toHaveBeenCalled();
    });

    test("400 items sem ids válidos após normalização", async () => {
      // Arrange: id inválido some no filter, sobra vazio
      const badItems = [{ id: 0, quantidade: 2 }, { id: "abc", quantidade: 1 }];

      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: JSON.stringify(badItems) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
      expect(String(res.body.message)).toContain("IDs ausentes/invalidos");
      expect(getQuoteMock).not.toHaveBeenCalled();
    });

    test("400 quantidade < 1 => INVALID_INPUT", async () => {
      // Arrange
      const items = [{ id: 1, quantidade: 0 }];

      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: JSON.stringify(items) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
      expect(String(res.body.message)).toContain("quantidade");
      expect(getQuoteMock).not.toHaveBeenCalled();
    });

    test("quando service lança AppError (ex.: 404 sem cobertura) deve repassar status/code", async () => {
      // Arrange
      loadAppWithMocks({
        getQuoteImpl: async () => {
          const AppError = require(appErrorPath);
          const ERROR_CODES = require(errorCodesPath);
          throw new AppError("CEP sem cobertura.", ERROR_CODES.INVALID_INPUT, 404);
        },
      });

      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: JSON.stringify([{ id: 1, quantidade: 1 }]) });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        code: "INVALID_INPUT",
        message: "CEP sem cobertura.",
      });
    });

    test("quando service lança erro genérico, faz wrap em SERVER_ERROR 500", async () => {
      // Arrange
      loadAppWithMocks({
        getQuoteImpl: async () => {
          throw new Error("boom");
        },
      });

      // Act
      const res = await request(app)
        .get("/api/shipping/quote")
        .query({ cep: "36940-000", items: JSON.stringify([{ id: 1, quantidade: 1 }]) });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: "SERVER_ERROR",
        message: "Erro ao cotar frete.",
      });
    });
  });
});
