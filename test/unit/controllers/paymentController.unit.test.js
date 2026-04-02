"use strict";

const paymentSvcPath = require.resolve("../../../services/paymentService");
const webhookSvcPath = require.resolve("../../../services/paymentWebhookService");

describe("paymentController", () => {
  let ctrl, paymentService, webhookService;
  let req, res, next;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(paymentSvcPath, () => ({
      listActiveMethods: jest.fn(),
      listAllMethods: jest.fn(),
      addMethod: jest.fn(),
      editMethod: jest.fn(),
      disableMethod: jest.fn(),
      startPayment: jest.fn(),
    }));

    jest.doMock(webhookSvcPath, () => ({
      handleWebhookEvent: jest.fn(),
    }));

    ctrl = require("../../../controllers/paymentController");
    paymentService = require(paymentSvcPath);
    webhookService = require(webhookSvcPath);

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  // -----------------------------------------------------------------------
  // listMethods (público)
  // -----------------------------------------------------------------------

  test("listMethods retorna { methods } do service", async () => {
    paymentService.listActiveMethods.mockResolvedValue([{ id: 1, name: "Pix" }]);
    req = {};

    await ctrl.listMethods(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ methods: [{ id: 1, name: "Pix" }] });
    expect(next).not.toHaveBeenCalled();
  });

  test("listMethods — erro bruto wrapeado em 500", async () => {
    paymentService.listActiveMethods.mockRejectedValue(new Error("db"));
    req = {};

    await ctrl.listMethods(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(500);
    expect(err.message).toContain("listar métodos");
  });

  test("listMethods — AppError do service propagado sem wrapper", async () => {
    const AppError = require("../../../errors/AppError");
    const appErr = new AppError("limite", "RATE_LIMIT", 429);
    paymentService.listActiveMethods.mockRejectedValue(appErr);
    req = {};

    await ctrl.listMethods(req, res, next);

    expect(next).toHaveBeenCalledWith(appErr);
  });

  // -----------------------------------------------------------------------
  // startPayment
  // -----------------------------------------------------------------------

  test("startPayment delega ao service e retorna resultado", async () => {
    paymentService.startPayment.mockResolvedValue({ init_point: "https://mp.com/pay" });
    req = { body: { pedidoId: 42 }, user: { id: 7 } };

    await ctrl.startPayment(req, res, next);

    expect(paymentService.startPayment).toHaveBeenCalledWith(42, 7);
    expect(res.json).toHaveBeenCalledWith({ init_point: "https://mp.com/pay" });
  });

  test("startPayment rejeita pedidoId inválido", async () => {
    req = { body: { pedidoId: "abc" }, user: { id: 1 } };

    await ctrl.startPayment(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(paymentService.startPayment).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // handleWebhook
  // -----------------------------------------------------------------------

  test("webhook retorna 200 { ok: true } em processamento normal", async () => {
    webhookService.handleWebhookEvent.mockResolvedValue("processed");
    req = {
      body: { id: "evt-1", type: "payment", data: { id: "pay-1" } },
      get: jest.fn().mockReturnValue("sig-header"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("webhook retorna 200 { ok: true, idempotent: true } para evento duplicado", async () => {
    webhookService.handleWebhookEvent.mockResolvedValue("idempotent");
    req = {
      body: { id: "evt-2", type: "payment", data: { id: "pay-2" } },
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true, idempotent: true });
  });

  test("webhook retorna 200 mesmo em erro (não expõe falha ao MP)", async () => {
    webhookService.handleWebhookEvent.mockRejectedValue(new Error("crash"));
    req = {
      body: { id: "evt-3", type: "payment", data: {} },
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    // Em produção retorna 200 para o MP não reenviar infinitamente
    expect(res.status).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  test("webhook ignora payload sem id", async () => {
    req = {
      body: {},
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(webhookService.handleWebhookEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("webhook processed (não-idempotent) → { ok: true } sem idempotent key", async () => {
    webhookService.handleWebhookEvent.mockResolvedValue("processed");
    req = {
      body: { id: "evt-proc", type: "payment", data: { id: "pay-p" } },
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("webhook com req.body=null → fallback {} → sem id → 200", async () => {
    req = {
      body: null,
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(webhookService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  test("webhook erro em NODE_ENV=development → retorna 500", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    webhookService.handleWebhookEvent.mockRejectedValue(new Error("dev crash"));
    req = {
      body: { id: "evt-dev", type: "payment", data: {} },
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false });

    process.env.NODE_ENV = origEnv;
  });

  test("webhook erro em NODE_ENV=production → retorna 200 { ok: true }", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    webhookService.handleWebhookEvent.mockRejectedValue(new Error("prod crash"));
    req = {
      body: { id: "evt-prod", type: "payment", data: {} },
      get: jest.fn().mockReturnValue("sig"),
    };

    await ctrl.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });

    process.env.NODE_ENV = origEnv;
  });

  // -----------------------------------------------------------------------
  // Admin CRUD
  // -----------------------------------------------------------------------

  test("adminListMethods retorna { methods }", async () => {
    paymentService.listAllMethods.mockResolvedValue([{ id: 1 }]);
    req = {};

    await ctrl.adminListMethods(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ methods: [{ id: 1 }] });
  });

  test("adminCreateMethod retorna 201 { method }", async () => {
    paymentService.addMethod.mockResolvedValue({ id: 2, code: "pix" });
    req = { body: { code: "pix", label: "Pix" } };

    await ctrl.adminCreateMethod(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ method: { id: 2, code: "pix" } });
  });

  test("adminUpdateMethod retorna { method }", async () => {
    paymentService.editMethod.mockResolvedValue({ id: 1, label: "Pix v2" });
    req = { params: { id: "1" }, body: { label: "Pix v2" } };

    await ctrl.adminUpdateMethod(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ method: { id: 1, label: "Pix v2" } });
  });

  test("adminCreateMethod propaga AppError do service", async () => {
    const AppError = require("../../../errors/AppError");
    const appErr = new AppError("dup", "VALIDATION_ERROR", 400);
    paymentService.addMethod.mockRejectedValue(appErr);
    req = { body: {} };

    await ctrl.adminCreateMethod(req, res, next);

    expect(next).toHaveBeenCalledWith(appErr);
  });

  test("adminDeleteMethod retorna { ok: true } (único endpoint formato A)", async () => {
    paymentService.disableMethod.mockResolvedValue();
    req = { params: { id: "5" } };

    await ctrl.adminDeleteMethod(req, res, next);

    expect(paymentService.disableMethod).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // -----------------------------------------------------------------------
  // Branch coverage: erro bruto (não-AppError) nos admin handlers
  // Cobre linhas 57, 88, 102 (ternário instanceof AppError → false)
  // -----------------------------------------------------------------------

  test("adminListMethods — erro bruto wrapeado em AppError 500", async () => {
    paymentService.listAllMethods.mockRejectedValue(new Error("raw db"));
    req = {};

    await ctrl.adminListMethods(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe("Erro ao listar métodos de pagamento (admin).");
    expect(err.status).toBe(500);
  });

  test("adminUpdateMethod — erro bruto wrapeado em AppError 500", async () => {
    paymentService.editMethod.mockRejectedValue(new Error("raw db"));
    req = { params: { id: "1" }, body: {} };

    await ctrl.adminUpdateMethod(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe("Erro ao atualizar método de pagamento.");
    expect(err.status).toBe(500);
  });

  test("adminDeleteMethod — erro bruto wrapeado em AppError 500", async () => {
    paymentService.disableMethod.mockRejectedValue(new Error("raw db"));
    req = { params: { id: "1" } };

    await ctrl.adminDeleteMethod(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe("Erro ao desativar método de pagamento.");
    expect(err.status).toBe(500);
  });

  // -----------------------------------------------------------------------
  // startPayment — branch: erro bruto com propriedades extra (linhas 130-141)
  // -----------------------------------------------------------------------

  test("startPayment — erro bruto com .message/.status/.error logado e wrapeado", async () => {
    const rawErr = new Error("MP API down");
    rawErr.status = 503;
    rawErr.error = "service_unavailable";
    paymentService.startPayment.mockRejectedValue(rawErr);
    req = { body: { pedidoId: 1 }, user: { id: 1 } };

    await ctrl.startPayment(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe("Erro ao iniciar pagamento com o Mercado Pago.");
    expect(err.status).toBe(500);
  });

  test("startPayment — erro bruto SEM .message/.status (branch interior)", async () => {
    paymentService.startPayment.mockRejectedValue({ weird: true });
    req = { body: { pedidoId: 1 }, user: { id: 1 } };

    await ctrl.startPayment(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(500);
  });

  test("startPayment — AppError do service é propagado sem wrapper", async () => {
    const AppError = require("../../../errors/AppError");
    const appErr = new AppError("Pedido não encontrado.", "NOT_FOUND", 404);
    paymentService.startPayment.mockRejectedValue(appErr);
    req = { body: { pedidoId: 1 }, user: { id: 1 } };

    await ctrl.startPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(appErr);
  });
});
