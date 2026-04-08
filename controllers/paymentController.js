"use strict";
// controllers/paymentController.js
//
// Handlers de pagamento: Mercado Pago + CRUD de métodos de pagamento.
// Todos os endpoints migrados para response.ok/created/noContent (Formato A).
// Webhook do MP: retorna { ok: true } com status 200 mesmo em erro
// (Mercado Pago interpreta 4xx/5xx como falha e reenvia infinitamente).

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const sentry = require("../lib/sentry");
const logger = require("../lib/logger");
const paymentService = require("../services/paymentService");
const { handleWebhookEvent } = require("../services/paymentWebhookService");

// ---------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------

const listMethods = async (_req, res, next) => {
  try {
    const methods = await paymentService.listActiveMethods();
    return response.ok(res, methods);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar métodos de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// ADMIN — CRUD de métodos de pagamento
// ---------------------------------------------------------------------------

const adminListMethods = async (_req, res, next) => {
  try {
    const methods = await paymentService.listAllMethods();
    return response.ok(res, methods);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar métodos de pagamento (admin).",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

const adminCreateMethod = async (req, res, next) => {
  try {
    const created = await paymentService.addMethod(req.body || {});
    return response.created(res, created);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const adminUpdateMethod = async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const updated = await paymentService.editMethod(id, req.body || {});
    return response.ok(res, updated);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const adminDeleteMethod = async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    await paymentService.disableMethod(id);
    return response.noContent(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao desativar método de pagamento.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// MERCADO PAGO — start payment
// ---------------------------------------------------------------------------

const startPayment = async (req, res, next) => {
  const { pedidoId } = req.body || {};
  const pedidoIdNum = Number(pedidoId);

  if (!Number.isFinite(pedidoIdNum) || pedidoIdNum <= 0) {
    return next(new AppError("pedidoId é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const result = await paymentService.startPayment(pedidoIdNum, req.user.id);
    return response.ok(res, result);
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err, pedidoId: pedidoIdNum }, "payment start error");
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao iniciar pagamento com o Mercado Pago.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// MERCADO PAGO — webhook
// ---------------------------------------------------------------------------

const handleWebhook = async (req, res) => {
  const signatureHeader = req.get("x-signature");

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});
    const eventId = String(req.body?.id ?? "");

    if (!eventId) {
      logger.warn("webhook payload missing notification id");
      return res.status(200).json({ ok: true });
    }

    const outcome = await handleWebhookEvent({
      eventId,
      type,
      dataId: data?.id,
      payload,
      signatureHeader,
    });

    return res
      .status(200)
      .json({ ok: true, ...(outcome === "idempotent" ? { idempotent: true } : {}) });
  } catch (err) {
    logger.error({ err, eventId: String(req.body?.id ?? "") }, "webhook processing error");

    // Always report webhook errors to Sentry — payment failures are critical.
    sentry.captureException(err, {
      tags: { domain: "webhook", transient: String(!!err.transient) },
      extra: { eventId: String(req.body?.id ?? ""), type: req.body?.type },
    });

    // Transient errors (MP API down, DB connection lost, etc.) → 500
    // so Mercado Pago retries with exponential backoff.
    // Business/permanent errors → 200 to prevent infinite retries.
    const isTransient = !!(err.transient);
    const status = isTransient ? 500 : 200;

    return res.status(status).json({ ok: !isTransient });
  }
};

module.exports = {
  listMethods,
  adminListMethods,
  adminCreateMethod,
  adminUpdateMethod,
  adminDeleteMethod,
  startPayment,
  handleWebhook,
};