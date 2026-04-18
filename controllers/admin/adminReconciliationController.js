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
const paymentService = require("../../services/corretoraPaymentService");
const domainHandler = require("../../services/payment/asaasDomainHandler");
const auditService = require("../../services/adminAuditService");
const logger = require("../../lib/logger");

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

/**
 * POST /api/admin/monetization/reconciliation/webhook-events/:id/retry
 *
 * ETAPA 1.3 — reaplica manualmente o domainEvent de um webhook_event
 * (normalmente usado quando processing_error != null). Fluxo:
 *   1. Carrega o event por id
 *   2. Chama asaasAdapter.translateWebhookEvent no payload salvo
 *      (re-deriva o domainEvent — não confiamos em cache)
 *   3. Passa pro domainHandler.applyDomainEvent
 *   4. markProcessed ou markFailed conforme resultado
 *   5. Grava audit "webhook_event.retried"
 *
 * Idempotente: se o evento já foi processed, o handler do domínio
 * pode ter efeito nulo (ex.: subscription já está "active"). Esse é
 * o comportamento correto — retry é seguro.
 */
async function retryWebhookEvent(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const event = await webhookEventsRepo.findById(id);
    if (!event) {
      throw new AppError(
        "Evento não encontrado.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }

    // Re-deriva o domainEvent do payload original (não confiamos em
    // cache — o adapter pode ter mudado a tradução entre tentativas).
    const adapter = paymentService.getAdapter(event.provider);
    if (!adapter) {
      throw new AppError(
        `Provider '${event.provider}' sem adapter configurado.`,
        ERROR_CODES.SERVER_ERROR,
        500,
      );
    }
    const domainEvent = adapter.translateWebhookEvent(event.payload);
    if (!domainEvent) {
      throw new AppError(
        "Payload não traduzível pelo adapter.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    try {
      const applied = await domainHandler.applyDomainEvent(domainEvent);
      await paymentService.markEventProcessed(id);
      auditService.record({
        req,
        action: "webhook_event.retried",
        targetType: "webhook_event",
        targetId: id,
        meta: {
          provider: event.provider,
          event_type: event.event_type,
          applied,
        },
      });
      return response.ok(
        res,
        { applied },
        applied.applied
          ? "Evento reprocessado com sucesso."
          : `Evento reprocessado sem efeito: ${applied.reason}`,
      );
    } catch (err) {
      const message = err?.message ?? String(err);
      await paymentService.markEventFailed(id, message);
      logger.warn(
        { err: message, webhookEventId: id },
        "admin.reconciliation.retry_failed",
      );
      throw new AppError(
        `Retry falhou: ${message}`,
        ERROR_CODES.SERVER_ERROR,
        500,
      );
    }
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao reprocessar evento.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = {
  listSubscriptions,
  listWebhookEvents,
  getSummary,
  retryWebhookEvent,
};
