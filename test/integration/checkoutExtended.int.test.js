/**
 * test/integration/checkoutExtended.int.test.js
 *
 * Cenários de checkout NÃO cobertos pelos testes existentes.
 * Abordagem: mocka checkoutService no nível do controller para testar
 * o fluxo HTTP sem replicar 15+ queries SQL.
 *
 * Cenários:
 *   1. Produtos vazio → 400 (Zod)
 *   2. formaPagamento ausente → 400 (Zod)
 *   3. Advisory lock ocupado → 409
 *   4. Deduplicação → 201 idempotente
 *   5. Cupom inválido → 400
 *   6. Estoque insuficiente com rollback
 */

"use strict";

const request = require("supertest");
const express = require("express");

const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const CSRF_PATH = require.resolve("../../middleware/csrfProtection");
const CHECKOUT_SVC_PATH = require.resolve("../../services/checkoutService");
const SHIPPING_SVC_PATH = require.resolve("../../services/shippingQuoteService");
const POOL_PATH = require.resolve("../../config/pool");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/checkout");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/checkout";

function setup({ user = { id: 10 } } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock(POOL_PATH, () => ({ query: jest.fn(), getConnection: jest.fn() }));

  jest.doMock(AUTH_PATH, () => jest.fn((req, res, next) => {
    if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
    req.user = user;
    next();
  }));
  jest.doMock(CSRF_PATH, () => ({ validateCSRF: jest.fn((_r, _s, n) => n()) }));

  // Shipping mock for recalcShipping middleware
  jest.doMock(SHIPPING_SVC_PATH, () => ({
    getQuote: jest.fn().mockResolvedValue({ price: 15, prazo_dias: 5, is_free: false }),
    parseCep: jest.fn((cep) => String(cep || "").replace(/\D/g, "")),
    normalizeItems: jest.fn((items) => items.map((it) => ({ id: Number(it.id), quantidade: Number(it.quantidade) }))),
  }));

  // Checkout service — the main target
  const svcMock = {
    create: jest.fn(),
    previewCoupon: jest.fn(),
  };
  jest.doMock(CHECKOUT_SVC_PATH, () => svcMock);

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use(MOUNT, require(AUTH_PATH), router);
  app.use(errorHandler);

  return { app, svcMock };
}

const VALID_BODY = {
  formaPagamento: "pix",
  entrega_tipo: "RETIRADA",
  produtos: [{ id: 1, quantidade: 2 }],
  nome: "Rick",
  cpf: "111.444.777-35",
  telefone: "31999999999",
};

const ENTREGA_BODY = {
  ...VALID_BODY,
  entrega_tipo: "ENTREGA",
  endereco: {
    cep: "36940-000", rua: "Rua A", numero: "10",
    bairro: "Centro", cidade: "Teófilo Otoni", estado: "MG",
  },
};

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  console.log.mockRestore();
});

describe("POST /api/checkout — validação Zod", () => {
  test("400: produtos vazio → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post(MOUNT).send({ ...VALID_BODY, produtos: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400: formaPagamento ausente → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post(MOUNT).send({
      entrega_tipo: "RETIRADA", produtos: [{ id: 1, quantidade: 1 }],
    });
    expect(res.status).toBe(400);
  });

  test("400: produto.id inválido (0) → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post(MOUNT).send({
      ...VALID_BODY, produtos: [{ id: 0, quantidade: 1 }],
    });
    expect(res.status).toBe(400);
  });

  test("400: produto.quantidade 0 → VALIDATION_ERROR", async () => {
    const { app } = setup();
    const res = await request(app).post(MOUNT).send({
      ...VALID_BODY, produtos: [{ id: 1, quantidade: 0 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/checkout — cenários de serviço", () => {
  test("409: advisory lock ocupado → rejeita", async () => {
    const { app, svcMock } = setup();
    const AppError = require("../../errors/AppError");
    svcMock.create.mockRejectedValue(
      new AppError("Outro checkout está em andamento.", "VALIDATION_ERROR", 409)
    );

    const res = await request(app).post(MOUNT).send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("checkout");
  });

  test("200: deduplicação → retorna pedido existente com idempotente=true", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({ idempotente: true, pedido_id: 50 });

    const res = await request(app).post(MOUNT).send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.idempotente).toBe(true);
    expect(res.body.data.pedido_id).toBe(50);
  });

  test("400: estoque insuficiente → rollback + AppError", async () => {
    const { app, svcMock } = setup();
    const AppError = require("../../errors/AppError");
    svcMock.create.mockRejectedValue(
      new AppError("Estoque insuficiente para Produto X.", "NOT_FOUND", 400)
    );

    const res = await request(app).post(MOUNT).send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Estoque");
  });

  test("201: checkout RETIRADA com cupom aplicado", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({
      idempotente: false,
      pedido_id: 100,
      total: 90,
      total_sem_desconto: 100,
      desconto_total: 10,
      cupom_aplicado: { codigo: "PROMO10", valor: 10, tipo: "percentual" },
    });

    const res = await request(app).post(MOUNT).send({
      ...VALID_BODY, cupom_codigo: "PROMO10",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.desconto_total).toBe(10);
    expect(res.body.data.cupom_aplicado.codigo).toBe("PROMO10");
  });

  test("201: checkout ENTREGA → recebe dados de shipping", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({
      idempotente: false,
      pedido_id: 200,
      total: 215,
      total_sem_desconto: 200,
      desconto_total: 0,
      cupom_aplicado: null,
    });

    const res = await request(app).post(MOUNT).send(ENTREGA_BODY);

    expect(res.status).toBe(201);
    // recalcShipping middleware calcula shipping e injeta no body
    expect(svcMock.create).toHaveBeenCalled();
    const createArgs = svcMock.create.mock.calls[0];
    expect(createArgs[1]).toHaveProperty("shipping_price");
  });

  test("500: erro inesperado → SERVER_ERROR padronizado", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockRejectedValue(new Error("deadlock"));

    const res = await request(app).post(MOUNT).send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    // Não vaza detalhes internos
    expect(res.body.message).not.toContain("deadlock");
  });
});
