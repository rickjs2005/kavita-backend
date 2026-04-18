// controllers/admin/adminReconciliationController.js
//
// Fase 6 — visão de reconciliação do admin. Dois blocos:
//   1. Assinaturas filtráveis por status de pagamento
//   2. Webhook events (recent + counts) para detectar integração quebrada
//
// Tudo read-only aqui. Retry manual de webhook fica fora do escopo
// desta fase (não há endpoint ainda; se virar necessidade recorrente
// criamos POST /reconciliation/webhook-events/:id/retry depois).
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const subsRepo = require("../../repositories/subscriptionsRepository");
const webhookEventsRepo = require("../../repositories/webhookEventsRepository");

async function listSubscriptions(req, res, next) {
  try {
    const allowed = [
      "overdue",
      "pending_checkout",
      "active_remote",
      "manual",
    ];
    const paymentStatus =
      typeof req.query.payment_status === "string" &&
      allowed.includes(req.query.payment_status)
        ? req.query.payment_status
        : undefined;

    const subs = await subsRepo.listForReconciliation({
      payment_status: paymentStatus,
    });
    return response.ok(res, subs);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar assinaturas.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function listWebhookEvents(req, res, next) {
  try {
    const allowed = ["all", "failed", "unprocessed", "processed"];
    const status =
      typeof req.query.status === "string" && allowed.includes(req.query.status)
        ? req.query.status
        : "all";

    const events = await webhookEventsRepo.listForReconciliation({
      status,
      limit: 100,
    });
    return response.ok(res, events);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar eventos de webhook.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function getSummary(_req, res, next) {
  try {
    const counts = await webhookEventsRepo.getReconciliationCounts();
    return response.ok(res, { webhook_events: counts });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar resumo.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  listSubscriptions,
  listWebhookEvents,
  getSummary,
};
