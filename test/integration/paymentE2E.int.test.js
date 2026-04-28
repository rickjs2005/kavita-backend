/**
 * test/integration/paymentE2E.int.test.js
 *
 * Testes E2E de pagamento — controller + service + repo integrados.
 * Diferente de payment.int.test.js que mocka o service inteiro.
 *
 * Cenários de RISCO REAL cobertos:
 *   1. Ownership: usuário A não pode pagar pedido do usuário B
 *   2. Status elegível: pedido já pago não pode ser pago novamente
 *   3. Forma de pagamento "prazo" rejeitada (não suportada por MP)
 *   4. Total zero/negativo rejeitado
 *   5. Webhook: evento duplicado → idempotente (sem reprocessar)
 *   6. Webhook: pagamento rejeitado → restaura estoque
 *   7. Webhook: evento não-payment → ignorado
 *   8. Webhook: sem pedidoId no metadata → ignorado
 */

"use strict";

const crypto = require("crypto");
const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const CSRF_PATH = require.resolve("../../middleware/csrfProtection");
const MP_CLIENT_PATH = require.resolve("../../config/mercadopago");
const MP_SDK_PATH = require.resolve("mercadopago");
const PAYMENT_REPO_PATH = require.resolve("../../repositories/paymentRepository");
const ORDER_REPO_PATH = require.resolve("../../repositories/orderRepository");
const WITH_TX_PATH = require.resolve("../../lib/withTransaction");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/payment");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");

const SECRET = "e2e-test-webhook-secret-32chars!";

function buildApp({ user = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  process.env.MP_WEBHOOK_SECRET = SECRET;
  process.env.APP_URL = "http://localhost:3000";

  // Pool mock
  jest.doMock(POOL_PATH, () => ({ query: jest.fn(), getConnection: jest.fn() }));

  // Auth
  jest.doMock(AUTH_PATH, () => jest.fn((req, res, next) => {
    if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
    req.user = user;
    next();
  }));

  // CSRF
  jest.doMock(CSRF_PATH, () => ({ validateCSRF: jest.fn((_r, _s, n) => n()) }));

  // verifyAdmin (admin routes won't be tested here)
  jest.doMock(require.resolve("../../middleware/verifyAdmin"), () => jest.fn((_r, res) =>
    res.status(401).json({ ok: false })
  ));

  // withTransaction for webhook service
  jest.doMock(WITH_TX_PATH, () => ({
    withTransaction: jest.fn(async (fn) => fn(mockConn)),
  }));

  // Payment repo
  const paymentRepoMock = {
    getPedidoById: jest.fn(),
    getTotalPedido: jest.fn(),
    setPedidoStatusPendente: jest.fn().mockResolvedValue(),
    getActiveMethods: jest.fn().mockResolvedValue([]),
    getAllMethods: jest.fn().mockResolvedValue([]),
    findMethodById: jest.fn(),
    createMethod: jest.fn(),
    updateMethodById: jest.fn(),
    softDeleteMethod: jest.fn(),
    findWebhookEventForUpdate: jest.fn(),
    insertWebhookEvent: jest.fn(),
    markWebhookEventReceived: jest.fn(),
    markWebhookEventIgnored: jest.fn(),
    markWebhookEventProcessed: jest.fn(),
    markWebhookEventParkedPendingMatch: jest.fn().mockResolvedValue(),
    findPedidoForUpdate: jest.fn().mockResolvedValue({ status_pagamento: "pendente" }),
    updatePedidoPayment: jest.fn().mockResolvedValue(),
  };
  jest.doMock(PAYMENT_REPO_PATH, () => paymentRepoMock);

  // Order repo
  const orderRepoMock = {
    restoreStockOnFailure: jest.fn().mockResolvedValue(),
  };
  jest.doMock(ORDER_REPO_PATH, () => orderRepoMock);

  // MP SDK
  const mpCreateMock = jest.fn().mockResolvedValue({
    id: "pref-123",
    init_point: "https://mp.com/checkout/123",
    sandbox_init_point: "https://mp.com/sandbox/123",
  });
  jest.doMock(MP_SDK_PATH, () => ({
    Preference: jest.fn().mockImplementation(() => ({ create: mpCreateMock })),
    Payment: jest.fn().mockImplementation(() => ({ get: mpPaymentGetMock })),
  }));
  jest.doMock(MP_CLIENT_PATH, () => ({ getMPClient: jest.fn(() => ({})) }));

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/payment", router);
  app.use(errorHandler);

  return { app, paymentRepoMock, orderRepoMock, mpCreateMock };
}

const mockConn = {};
const mpPaymentGetMock = jest.fn();

function signWebhook(dataId, ts = String(Date.now()), reqId = "req-1") {
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${hmac}`;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  delete process.env.MP_WEBHOOK_SECRET;
});

// =========================================================================
// PAYMENT START — E2E (controller → service → repo)
// =========================================================================

describe("POST /api/payment/start — E2E", () => {
  test("404: ownership — user 7 não pode pagar pedido do user 99", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 99, status_pagamento: "pendente", forma_pagamento: "pix",
    });

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    // Não diz "não pertence a você" — diz "não encontrado" (sem info leak)
    expect(res.body.message).toContain("não encontrado");
  });

  test("409: pedido já pago → não pode pagar novamente", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pago", forma_pagamento: "pix",
    });

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(409);
  });

  test("400: forma_pagamento 'prazo' → rejeitada (MP não suporta)", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "prazo",
    });

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Prazo");
  });

  test("400: total do pedido é zero → rejeitado", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "pix",
    });
    paymentRepoMock.getTotalPedido.mockResolvedValue(0);

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("valor");
  });

  test("200: fluxo feliz PIX → preference criada + status pendente", async () => {
    const { app, paymentRepoMock, mpCreateMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "pix",
    });
    paymentRepoMock.getTotalPedido.mockResolvedValue(199.90);

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.init_point).toContain("mp.com");
    expect(mpCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentRepoMock.setPedidoStatusPendente).toHaveBeenCalledWith(1);

    // Verifica que PIX exclui cartão e boleto
    const body = mpCreateMock.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual(
      expect.arrayContaining([{ id: "credit_card" }, { id: "ticket" }])
    );
  });

  test("200: status 'falhou' permite repagamento", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "falhou", forma_pagamento: "boleto",
    });
    paymentRepoMock.getTotalPedido.mockResolvedValue(100);

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(200);
  });

  test("200: boleto → preference exclui credit_card e bank_transfer", async () => {
    const { app, paymentRepoMock, mpCreateMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "boleto",
    });
    paymentRepoMock.getTotalPedido.mockResolvedValue(150);

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(200);
    const body = mpCreateMock.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual(
      expect.arrayContaining([{ id: "credit_card" }, { id: "bank_transfer" }])
    );
  });

  test("200: cartao_mp → preference exclui bank_transfer e ticket", async () => {
    const { app, paymentRepoMock, mpCreateMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "cartao_mp",
    });
    paymentRepoMock.getTotalPedido.mockResolvedValue(200);

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(200);
    const body = mpCreateMock.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual(
      expect.arrayContaining([{ id: "bank_transfer" }, { id: "ticket" }])
    );
  });

  test("409: status 'estornado' → rejeita repagamento", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "estornado", forma_pagamento: "pix",
    });

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("não pode ser pago");
  });

  test("400: forma_pagamento vazia no pedido → VALIDATION_ERROR", async () => {
    const { app, paymentRepoMock } = buildApp({ user: { id: 7 } });
    paymentRepoMock.getPedidoById.mockResolvedValue({
      id: 1, usuario_id: 7, status_pagamento: "pendente", forma_pagamento: "",
    });

    const res = await request(app).post("/api/payment/start").send({ pedidoId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Forma de pagamento");
  });
});

// =========================================================================
// WEBHOOK — E2E (signature → service → repo)
// =========================================================================

describe("POST /api/payment/webhook — E2E", () => {
  test("200: evento duplicado → idempotente (sem reprocessar)", async () => {
    const { app, paymentRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockResolvedValue({
      id: 1, status: "pago", processed_at: new Date(),
    });

    const dataId = "pay-1";
    const sig = signWebhook(dataId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-dup", type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    // Não chamou MP API nem atualizou pedido
    expect(mpPaymentGetMock).not.toHaveBeenCalled();
    expect(paymentRepoMock.updatePedidoPayment).not.toHaveBeenCalled();
  });

  test("200: pagamento aprovado → atualiza status para 'pago'", async () => {
    const { app, paymentRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockResolvedValue(null);
    paymentRepoMock.insertWebhookEvent.mockResolvedValue(1);
    mpPaymentGetMock.mockResolvedValue({
      status: "approved",
      metadata: { pedidoId: 42 },
    });

    const dataId = "pay-approved";
    const sig = signWebhook(dataId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-ok", type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(paymentRepoMock.updatePedidoPayment).toHaveBeenCalledWith(
      {}, 42, "pago", "pay-approved"
    );
  });

  test("200: pagamento rejeitado → restaura estoque + status 'falhou'", async () => {
    const { app, paymentRepoMock, orderRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockResolvedValue(null);
    paymentRepoMock.insertWebhookEvent.mockResolvedValue(1);
    mpPaymentGetMock.mockResolvedValue({
      status: "rejected",
      metadata: { pedidoId: 10 },
    });

    const dataId = "pay-rejected";
    const sig = signWebhook(dataId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-rej", type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(orderRepoMock.restoreStockOnFailure).toHaveBeenCalledWith({}, 10);
    expect(paymentRepoMock.updatePedidoPayment).toHaveBeenCalledWith(
      {}, 10, "falhou", "pay-rejected"
    );
  });

  test("200: evento não-payment (ex: merchant_order) → ignorado", async () => {
    const { app, paymentRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockResolvedValue(null);
    paymentRepoMock.insertWebhookEvent.mockResolvedValue(1);
    paymentRepoMock.markWebhookEventIgnored.mockResolvedValue();

    const dataId = "order-1";
    const sig = signWebhook(dataId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-mo", type: "merchant_order", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(paymentRepoMock.markWebhookEventIgnored).toHaveBeenCalled();
    expect(mpPaymentGetMock).not.toHaveBeenCalled();
  });

  test("200: payment sem pedidoId no metadata → ignorado", async () => {
    const { app, paymentRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockResolvedValue(null);
    paymentRepoMock.insertWebhookEvent.mockResolvedValue(1);
    mpPaymentGetMock.mockResolvedValue({
      status: "approved",
      metadata: {}, // sem pedidoId
    });

    const dataId = "pay-no-meta";
    const sig = signWebhook(dataId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-nm", type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(paymentRepoMock.markWebhookEventIgnored).toHaveBeenCalled();
    expect(paymentRepoMock.updatePedidoPayment).not.toHaveBeenCalled();
  });

  test("200: erro interno no webhook → não retorna 5xx em produção", async () => {
    const { app, paymentRepoMock } = buildApp();
    paymentRepoMock.findWebhookEventForUpdate.mockRejectedValue(new Error("DB crash"));

    const dataId = "pay-err";
    const sig = signWebhook(dataId);

    // Em produção retornaria 200 (fail-safe para MP). Em test retorna 500.
    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", sig)
      .set("x-request-id", "req-1")
      .send({ id: "evt-err", type: "payment", data: { id: dataId } });

    // NODE_ENV=test → production-like behavior → 200 (fail-safe for MP)
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
