// routes/public/webhookAsaas.js
//
// ETAPA 1.2/1.3 — webhook do Asaas (sem auth; validação via assinatura
// no próprio adapter).
//
// Fluxo:
//   1. corretoraPaymentService.ingestWebhook valida assinatura,
//      traduz em domainEvent e grava em webhook_events com
//      INSERT IGNORE (idempotência).
//   2. Se for novo, chama asaasDomainHandler.applyDomainEvent que faz
//      a transição real na corretora_subscriptions.
//   3. Se sucesso, markProcessed; se falhar, markFailed (retry manual
//      admin via POST /admin/monetization/reconciliation/webhook-events/:id/retry).
//
// Sem CSRF — é webhook externo. A validação de assinatura HMAC do
// Asaas é a segurança do endpoint.
"use strict";

const express = require("express");
const router = express.Router();
const paymentService = require("../../services/corretoraPaymentService");
const domainHandler = require("../../services/payment/asaasDomainHandler");
const { webhookLimiter } = require("../../middleware/absoluteRateLimit");
const logger = require("../../lib/logger");

router.post("/", webhookLimiter, async (req, res) => {
  try {
    const result = await paymentService.ingestWebhook({
      provider: "asaas",
      req,
    });

    if (!result.stored) {
      // Duplicado ou não traduzível — respondemos 200 igual. Asaas
      // re-tenta se retornarmos != 200; aqui é sucesso silencioso.
      return res.status(200).json({ ok: true, stored: false });
    }

    try {
      const applied = await domainHandler.applyDomainEvent(result.domainEvent);
      await paymentService.markEventProcessed(result.webhookEventId);
      return res.status(200).json({ ok: true, stored: true, applied });
    } catch (err) {
      logger.error(
        {
          err: err?.message ?? String(err),
          webhookEventId: result.webhookEventId,
        },
        "asaas.webhook.domain_apply_failed",
      );
      await paymentService.markEventFailed(
        result.webhookEventId,
        err?.message ?? String(err),
      );
      // Retornamos 200 mesmo assim — o evento já está persistido e
      // o admin pode reprocessar. Se retornássemos 500, o Asaas
      // re-dispara N vezes até desistir, inflando webhook_events.
      return res.status(200).json({
        ok: false,
        stored: true,
        applied: false,
        reason: "domain_handler_failed",
      });
    }
  } catch (err) {
    // Erro de ingestão (assinatura inválida etc.) — deixa o
    // errorHandler padrão formatar
    return res
      .status(err?.status ?? 401)
      .json({ ok: false, code: err?.code ?? "AUTH_ERROR" });
  }
});

module.exports = router;
