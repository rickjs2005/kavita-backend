/**
 * test/integration/checkoutDeep.int.test.js
 *
 * Cenários profundos de checkout NÃO cobertos anteriormente:
 *
 *   POST /api/checkout/preview-cupom:
 *     - Cupom ausente → 400
 *     - Produtos ausentes → 400
 *     - Cupom inexistente no DB → 400
 *     - Cupom válido → 200 com desconto calculado
 *     - Erro interno → 500
 *
 *   POST /api/checkout:
 *     - formaPagamento inválida (bypass Zod, guard do controller) → 400
 *     - ENTREGA RURAL sem comunidade → 400 (Zod)
 *     - Checkout com cartão MP normalizado (cartao_mp) → 201
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
  jest.doMock(SHIPPING_SVC_PATH, () => ({
    getQuote: jest.fn().mockResolvedValue({ price: 15, prazo_dias: 5, is_free: false }),
    parseCep: jest.fn((cep) => String(cep || "").replace(/\D/g, "")),
    normalizeItems: jest.fn((items) => items.map((it) => ({ id: Number(it.id), quantidade: Number(it.quantidade) }))),
  }));

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

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
});

// =========================================================================
// POST /api/checkout/preview-cupom
// =========================================================================

describe("POST /api/checkout/preview-cupom", () => {
  test("400: código ausente", async () => {
    const { app } = setup();
    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      produtos: [{ id: 1, quantidade: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cupom");
  });

  test("400: código vazio (só espaços)", async () => {
    const { app } = setup();
    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "   ", produtos: [{ id: 1, quantidade: 1 }],
    });
    expect(res.status).toBe(400);
  });

  test("400: produtos ausente", async () => {
    const { app } = setup();
    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "PROMO10",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("produtos");
  });

  test("400: produtos vazio", async () => {
    const { app } = setup();
    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "PROMO10", produtos: [],
    });
    expect(res.status).toBe(400);
  });

  test("400: cupom inexistente → AppError do service", async () => {
    const { app, svcMock } = setup();
    const AppError = require("../../errors/AppError");
    svcMock.previewCoupon.mockRejectedValue(
      new AppError("Cupom inválido ou não encontrado.", "VALIDATION_ERROR", 400)
    );

    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "INVALIDO", produtos: [{ id: 1, quantidade: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Cupom inválido");
  });

  test("200: cupom válido → retorna desconto calculado", async () => {
    const { app, svcMock } = setup();
    svcMock.previewCoupon.mockResolvedValue({
      desconto: 15,
      total_original: 150,
      total_com_desconto: 135,
      cupom: { codigo: "PROMO10", tipo: "percentual", valor: 10 },
    });

    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "PROMO10", produtos: [{ id: 1, quantidade: 3 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.desconto).toBe(15);
    expect(res.body.data.total_original).toBe(150);
    expect(res.body.data.total_com_desconto).toBe(135);
    expect(res.body.data.cupom.codigo).toBe("PROMO10");
    expect(res.body.message).toContain("Cupom aplicado");
  });

  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "PROMO10", produtos: [{ id: 1, quantidade: 1 }],
    });
    expect(res.status).toBe(401);
  });

  test("500: erro genérico do service → SERVER_ERROR", async () => {
    const { app, svcMock } = setup();
    svcMock.previewCoupon.mockRejectedValue(new Error("DB crash"));

    const res = await request(app).post(`${MOUNT}/preview-cupom`).send({
      codigo: "PROMO10", produtos: [{ id: 1, quantidade: 1 }],
    });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("SERVER_ERROR");
    expect(res.body.message).not.toContain("DB crash");
  });
});

// =========================================================================
// POST /api/checkout — cenários adicionais
// =========================================================================

describe("POST /api/checkout — bordas adicionais", () => {
  test("400: ENTREGA RURAL sem comunidade → VALIDATION_ERROR (Zod)", async () => {
    const { app } = setup();

    const res = await request(app).post(MOUNT).send({
      formaPagamento: "pix",
      entrega_tipo: "ENTREGA",
      produtos: [{ id: 1, quantidade: 1 }],
      endereco: {
        cep: "36940-000",
        cidade: "Teófilo Otoni",
        estado: "MG",
        tipo_localidade: "RURAL",
        // falta comunidade e observacoes_acesso
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("201: formaPagamento 'cartao_mp' aceita (normalização)", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({
      idempotente: false, pedido_id: 300,
      total: 200, total_sem_desconto: 200,
      desconto_total: 0, cupom_aplicado: null,
    });

    const res = await request(app).post(MOUNT).send({
      formaPagamento: "cartao_mp",
      entrega_tipo: "RETIRADA",
      produtos: [{ id: 1, quantidade: 2 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.pedido_id).toBe(300);
  });

  test("201: formaPagamento 'boleto' aceita", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({
      idempotente: false, pedido_id: 301,
      total: 100, total_sem_desconto: 100,
      desconto_total: 0, cupom_aplicado: null,
    });

    const res = await request(app).post(MOUNT).send({
      formaPagamento: "boleto",
      entrega_tipo: "RETIRADA",
      produtos: [{ id: 1, quantidade: 1 }],
    });

    expect(res.status).toBe(201);
  });

  test("201: resposta inclui nota_fiscal_aviso", async () => {
    const { app, svcMock } = setup();
    svcMock.create.mockResolvedValue({
      idempotente: false, pedido_id: 302,
      total: 100, total_sem_desconto: 100,
      desconto_total: 0, cupom_aplicado: null,
    });

    const res = await request(app).post(MOUNT).send({
      formaPagamento: "pix",
      entrega_tipo: "RETIRADA",
      produtos: [{ id: 1, quantidade: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.nota_fiscal_aviso).toContain("Nota fiscal");
  });
});
