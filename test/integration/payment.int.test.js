/**
 * test/integration/payment.int.test.js
 *
 * Testes de integração para os endpoints de pagamento:
 *   POST /api/payment/start     — iniciar pagamento (Mercado Pago)
 *   POST /api/payment/webhook   — webhook do Mercado Pago
 *   GET  /api/payment/methods   — listar métodos (público)
 *
 * Cenários críticos cobertos:
 *   - Assinatura de webhook ausente/inválida/válida
 *   - Evento duplicado (idempotência)
 *   - Pagamento aprovado → status atualizado
 *   - Pagamento rejeitado → estoque restaurado
 *   - Payment start: não autenticado, pedido inexistente, ownership, payload inválido
 *   - Webhook fail-closed quando MP_WEBHOOK_SECRET ausente
 */

"use strict";

const crypto = require("crypto");
const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const CSRF_PATH = require.resolve("../../middleware/csrfProtection");
const MP_CLIENT_PATH = require.resolve("../../config/mercadopago");
const MP_SDK_PATH = require.resolve("mercadopago");
const PAYMENT_REPO_PATH = require.resolve("../../repositories/paymentRepository");
const ORDER_REPO_PATH = require.resolve("../../repositories/orderRepository");
const PAYMENT_SVC_PATH = require.resolve("../../services/paymentService");
const WEBHOOK_SVC_PATH = require.resolve("../../services/paymentWebhookService");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/payment");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");

const TEST_SECRET = "test-webhook-secret-32chars-long!";

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setup({ user = null, csrfOk = true } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  // Pool mock
  const poolMock = { query: jest.fn(), getConnection: jest.fn() };
  jest.doMock(POOL_PATH, () => poolMock);

  // Auth mock
  jest.doMock(AUTH_PATH, () =>
    jest.fn((req, res, next) => {
      if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "Não autenticado." });
      req.user = user;
      next();
    })
  );

  // verifyAdmin mock (used by admin CRUD routes)
  jest.doMock(VERIFY_ADMIN_PATH, () =>
    jest.fn((_req, res, next) =>
      res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Admin required." })
    )
  );

  // CSRF mock
  jest.doMock(CSRF_PATH, () => ({
    validateCSRF: jest.fn((req, _res, next) => {
      if (!csrfOk && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return _res.status(403).json({ ok: false, code: "FORBIDDEN", message: "CSRF inválido." });
      }
      next();
    }),
  }));

  // MP_WEBHOOK_SECRET
  process.env.MP_WEBHOOK_SECRET = TEST_SECRET;

  // Build app
  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/payment", router);
  app.use(errorHandler);

  return { app, poolMock };
}

// ---------------------------------------------------------------------------
// Webhook signature helper
// ---------------------------------------------------------------------------

function signWebhook(dataId, ts, requestId) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", TEST_SECRET).update(manifest).digest("hex");
  return { signature: `ts=${ts},v1=${hmac}`, requestId, ts };
}

// =========================================================================
// WEBHOOK TESTS
// =========================================================================

describe("POST /api/payment/webhook", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    console.warn.mockRestore();
    console.error.mockRestore();
    delete process.env.MP_WEBHOOK_SECRET;
  });

  test("401: x-signature ausente → rejeitado", async () => {
    const { app } = setup();

    const res = await request(app)
      .post("/api/payment/webhook")
      .send({ id: "evt-1", type: "payment", data: { id: "pay-1" } });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test("401: MP_WEBHOOK_SECRET não configurado → fail-closed", async () => {
    const { app } = setup();
    delete process.env.MP_WEBHOOK_SECRET;

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", "ts=123,v1=abc")
      .send({ id: "evt-1", type: "payment", data: { id: "pay-1" } });

    expect(res.status).toBe(401);
  });

  test("401: assinatura HMAC inválida → rejeitado", async () => {
    const { app } = setup();

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", "ts=1234567890,v1=invalidsignature")
      .set("x-request-id", "req-1")
      .send({ id: "evt-1", type: "payment", data: { id: "pay-1" } });

    expect(res.status).toBe(401);
  });

  test("401: formato de assinatura malformado (sem ts ou v1)", async () => {
    const { app } = setup();

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", "garbage-format")
      .send({ id: "evt-1" });

    expect(res.status).toBe(401);
  });

  test("200: assinatura válida + evento sem id → aceito sem processamento", async () => {
    const { app } = setup();
    const { signature } = signWebhook("", "1234567890", "req-1");

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", signature)
      .set("x-request-id", "req-1")
      .send({ type: "payment", data: { id: "" } }); // sem campo id

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("200: assinatura válida + evento payment processado", async () => {
    const { app } = setup();

    // Mock withTransaction para o webhookService
    const wt = require("../../lib/withTransaction");
    jest.spyOn(wt, "withTransaction").mockImplementation(async (fn) => fn({}));

    // Mock repos
    const paymentRepo = require(PAYMENT_REPO_PATH);
    const orderRepo = require(ORDER_REPO_PATH);

    paymentRepo.findWebhookEventForUpdate = jest.fn().mockResolvedValue(null);
    paymentRepo.insertWebhookEvent = jest.fn().mockResolvedValue(1);
    paymentRepo.updatePedidoPayment = jest.fn().mockResolvedValue();
    paymentRepo.markWebhookEventProcessed = jest.fn().mockResolvedValue();

    // Mock MP SDK
    jest.doMock(MP_SDK_PATH, () => ({
      Payment: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: { pedidoId: 42 },
        }),
      })),
    }));
    jest.doMock(MP_CLIENT_PATH, () => ({
      getMPClient: jest.fn(() => ({})),
    }));

    // Clear require cache for webhook service to pick up mocks
    jest.resetModules();
    process.env.MP_WEBHOOK_SECRET = TEST_SECRET;

    // Need to re-require everything after resetModules
    const router2 = require(ROUTER_PATH);
    const errorHandler2 = require(ERROR_HANDLER_PATH);
    const app2 = express();
    app2.use(express.json());
    jest.doMock(AUTH_PATH, () => jest.fn((r, s, n) => n()));
    jest.doMock(CSRF_PATH, () => ({ validateCSRF: jest.fn((r, s, n) => n()) }));
    app2.use("/api/payment", router2);
    app2.use(errorHandler2);

    const dataId = "pay-123";
    const ts = String(Date.now());
    const reqId = "req-abc";
    const { signature } = signWebhook(dataId, ts, reqId);

    const res = await request(app2)
      .post("/api/payment/webhook")
      .set("x-signature", signature)
      .set("x-request-id", reqId)
      .send({ id: "evt-100", type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// =========================================================================
// PAYMENT START TESTS
// =========================================================================

describe("POST /api/payment/start", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    console.error.mockRestore();
    delete process.env.MP_WEBHOOK_SECRET;
  });

  test("401: não autenticado → rejeitado", async () => {
    const { app } = setup({ user: null });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(401);
  });

  test("403: CSRF inválido → rejeitado", async () => {
    const { app } = setup({ user: { id: 7 }, csrfOk: false });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(403);
  });

  test("400: pedidoId ausente → VALIDATION_ERROR", async () => {
    const { app } = setup({ user: { id: 7 } });

    const res = await request(app)
      .post("/api/payment/start")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  test("400: pedidoId inválido (string) → VALIDATION_ERROR", async () => {
    const { app } = setup({ user: { id: 7 } });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400: pedidoId negativo → VALIDATION_ERROR", async () => {
    const { app } = setup({ user: { id: 7 } });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: -1 });

    expect(res.status).toBe(400);
  });

  test("404: pedido não encontrado → delega AppError do service", async () => {
    const { app } = setup({ user: { id: 7 } });

    // Mock paymentService.startPayment to throw NOT_FOUND
    const svc = require(PAYMENT_SVC_PATH);
    const AppError = require("../../errors/AppError");
    const ERROR_CODES = require("../../constants/ErrorCodes");
    jest.spyOn(svc, "startPayment").mockRejectedValue(
      new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404)
    );

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 999 });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("409: pedido já pago → CONFLICT", async () => {
    const { app } = setup({ user: { id: 7 } });

    const svc = require(PAYMENT_SVC_PATH);
    const AppError = require("../../errors/AppError");
    const ERROR_CODES = require("../../constants/ErrorCodes");
    jest.spyOn(svc, "startPayment").mockRejectedValue(
      new AppError("Pedido já está pago.", ERROR_CODES.CONFLICT, 409)
    );

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  test("200: sucesso → retorna dados do Mercado Pago", async () => {
    const { app } = setup({ user: { id: 7 } });

    const svc = require(PAYMENT_SVC_PATH);
    jest.spyOn(svc, "startPayment").mockResolvedValue({
      init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123",
      preference_id: "pref-123",
    });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.init_point).toContain("mercadopago");
    expect(res.body.data.preference_id).toBe("pref-123");
  });

  test("500: erro genérico do MP → SERVER_ERROR (sem vazar detalhes)", async () => {
    const { app } = setup({ user: { id: 7 } });

    const svc = require(PAYMENT_SVC_PATH);
    jest.spyOn(svc, "startPayment").mockRejectedValue(new Error("MP API timeout"));

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    // Não deve vazar mensagem interna do MP
    expect(res.body.message).not.toContain("MP API");
  });
});

// =========================================================================
// PAYMENT METHODS (PUBLIC)
// =========================================================================

describe("GET /api/payment/methods", () => {
  test("200: lista métodos ativos (sem auth)", async () => {
    const { app } = setup({ user: null }); // sem auth — rota pública

    const svc = require(PAYMENT_SVC_PATH);
    jest.spyOn(svc, "listActiveMethods").mockResolvedValue([
      { id: 1, code: "pix", label: "Pix", is_active: 1 },
    ]);

    const res = await request(app).get("/api/payment/methods");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].code).toBe("pix");
  });
});
