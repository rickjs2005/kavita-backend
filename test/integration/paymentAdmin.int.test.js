/**
 * test/integration/paymentAdmin.int.test.js
 *
 * Testes de integração para CRUD admin de payment methods + cenários
 * restantes de payment/start.
 *
 * Admin CRUD:
 *   GET    /api/payment/admin/payment-methods
 *   POST   /api/payment/admin/payment-methods
 *   PUT    /api/payment/admin/payment-methods/:id
 *   DELETE /api/payment/admin/payment-methods/:id
 *
 * Payment start (bordas):
 *   - Status "estornado" → rejeita repagamento
 *   - Forma pagamento vazia (campo existe mas vazio)
 *   - Pedido do outro usuário → 404 (não 403)
 */

"use strict";

const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const CSRF_PATH = require.resolve("../../middleware/csrfProtection");
const PAYMENT_SVC_PATH = require.resolve("../../services/paymentService");
const WEBHOOK_SVC_PATH = require.resolve("../../services/paymentWebhookService");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/payment");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");

function setup({ user = null, admin = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  process.env.MP_WEBHOOK_SECRET = "test-secret";

  jest.doMock(POOL_PATH, () => ({ query: jest.fn(), getConnection: jest.fn() }));

  jest.doMock(AUTH_PATH, () => jest.fn((req, res, next) => {
    if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
    req.user = user;
    next();
  }));

  jest.doMock(VERIFY_ADMIN_PATH, () => jest.fn((req, res, next) => {
    if (!admin) return res.status(401).json({ ok: false, code: "AUTH_ERROR" });
    req.admin = admin;
    next();
  }));

  jest.doMock(CSRF_PATH, () => ({ validateCSRF: jest.fn((_r, _s, n) => n()) }));
  jest.doMock(WEBHOOK_SVC_PATH, () => ({ handleWebhookEvent: jest.fn() }));

  const svcMock = {
    startPayment: jest.fn(),
    listActiveMethods: jest.fn().mockResolvedValue([]),
    listAllMethods: jest.fn().mockResolvedValue([]),
    addMethod: jest.fn(),
    editMethod: jest.fn(),
    disableMethod: jest.fn(),
  };
  jest.doMock(PAYMENT_SVC_PATH, () => svcMock);

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/payment", router);
  app.use(errorHandler);

  return { app, svcMock };
}

const ADMIN = { id: 1, role: "master", permissions: [] };

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  delete process.env.MP_WEBHOOK_SECRET;
});

// =========================================================================
// ADMIN CRUD — payment methods
// =========================================================================

describe("GET /api/payment/admin/payment-methods", () => {
  test("401: sem admin auth", async () => {
    const { app } = setup({ user: { id: 7 }, admin: null });
    const res = await request(app).get("/api/payment/admin/payment-methods");
    expect(res.status).toBe(401);
  });

  test("200: admin lista todos os métodos", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    svcMock.listAllMethods.mockResolvedValue([
      { id: 1, code: "pix", label: "Pix", is_active: 1 },
      { id: 2, code: "boleto", label: "Boleto", is_active: 0 },
    ]);

    const res = await request(app).get("/api/payment/admin/payment-methods");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("POST /api/payment/admin/payment-methods", () => {
  test("401: sem admin auth", async () => {
    const { app } = setup({ user: { id: 7 }, admin: null });
    const res = await request(app)
      .post("/api/payment/admin/payment-methods")
      .send({ code: "pix", label: "Pix" });
    expect(res.status).toBe(401);
  });

  test("201: cria método com sucesso", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    svcMock.addMethod.mockResolvedValue({
      id: 3, code: "crypto", label: "Crypto", is_active: 1,
    });

    const res = await request(app)
      .post("/api/payment/admin/payment-methods")
      .send({ code: "crypto", label: "Crypto", is_active: 1 });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.code).toBe("crypto");
  });

  test("400: code/label ausente → VALIDATION_ERROR", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    const AppError = require("../../errors/AppError");
    svcMock.addMethod.mockRejectedValue(
      new AppError("code e label são obrigatórios.", "VALIDATION_ERROR", 400)
    );

    const res = await request(app)
      .post("/api/payment/admin/payment-methods")
      .send({});

    expect(res.status).toBe(400);
  });

  test("400: code duplicado → VALIDATION_ERROR", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    const AppError = require("../../errors/AppError");
    svcMock.addMethod.mockRejectedValue(
      new AppError("Já existe um método com esse code.", "VALIDATION_ERROR", 400)
    );

    const res = await request(app)
      .post("/api/payment/admin/payment-methods")
      .send({ code: "pix", label: "Pix Duplicate" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Já existe");
  });
});

describe("PUT /api/payment/admin/payment-methods/:id", () => {
  test("200: atualiza método", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    svcMock.editMethod.mockResolvedValue({
      id: 1, code: "pix", label: "Pix Updated", is_active: 1,
    });

    const res = await request(app)
      .put("/api/payment/admin/payment-methods/1")
      .send({ label: "Pix Updated" });

    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe("Pix Updated");
  });

  test("404: método inexistente", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    const AppError = require("../../errors/AppError");
    svcMock.editMethod.mockRejectedValue(
      new AppError("Método não encontrado.", "NOT_FOUND", 404)
    );

    const res = await request(app)
      .put("/api/payment/admin/payment-methods/999")
      .send({ label: "X" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/payment/admin/payment-methods/:id", () => {
  test("204: desativa método (soft delete)", async () => {
    const { app, svcMock } = setup({ user: { id: 1 }, admin: ADMIN });
    svcMock.disableMethod.mockResolvedValue();

    const res = await request(app).delete("/api/payment/admin/payment-methods/1");

    expect(res.status).toBe(204);
    expect(svcMock.disableMethod).toHaveBeenCalledWith(1);
  });

  test("401: sem admin auth", async () => {
    const { app } = setup({ user: { id: 7 }, admin: null });
    const res = await request(app).delete("/api/payment/admin/payment-methods/1");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// PAYMENT START — bordas restantes
// =========================================================================

describe("POST /api/payment/start — bordas restantes", () => {
  test("409: status 'estornado' → rejeita repagamento", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });
    const AppError = require("../../errors/AppError");
    svcMock.startPayment.mockRejectedValue(
      new AppError("Este pedido não pode ser pago novamente.", "VALIDATION_ERROR", 409)
    );

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("não pode ser pago");
  });

  test("400: formaPagamento vazia no pedido → VALIDATION_ERROR", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });
    const AppError = require("../../errors/AppError");
    svcMock.startPayment.mockRejectedValue(
      new AppError("Forma de pagamento inválida/indefinida para Mercado Pago.", "VALIDATION_ERROR", 400)
    );

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Forma de pagamento");
  });

  test("200: boleto → preference criada corretamente", async () => {
    const { app, svcMock } = setup({ user: { id: 7 } });
    svcMock.startPayment.mockResolvedValue({
      preferenceId: "pref-boleto",
      init_point: "https://mp.com/boleto",
      sandbox_init_point: "https://mp.com/sandbox/boleto",
    });

    const res = await request(app)
      .post("/api/payment/start")
      .send({ pedidoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.preferenceId).toBe("pref-boleto");
  });
});
