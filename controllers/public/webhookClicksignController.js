// controllers/public/webhookClicksignController.js
//
// Webhook da ClickSign (Fase 10.1 — PR 2). Sem auth — a segurança é
// a assinatura HMAC-SHA256 do payload com chave secreta compartilhada.
//
// Protocolo:
//   1. Middleware de rota monta `req.rawBody` (Buffer) via express.raw
//   2. Validamos HMAC com adapter.verifySignature
//   3. Parseamos JSON e passamos ao adapter.translateWebhookEvent
//   4. Gravamos em webhook_events (idempotência por provider_event_id)
//   5. Se novo e status_hint existe, orquestrador aplica transição
//   6. Marcamos webhook_events.processed_at (ou _failed com motivo)
//
// Sempre 200 (mesmo em erro de domínio), exceto para assinatura
// inválida — que retorna 401. Assim evitamos inflar retries da
// ClickSign e cobrimos falhas via reconciliação manual.
"use strict";

const clicksignAdapter = require("../../services/contratos/clicksignAdapter");
const signerService = require("../../services/contratoSignerService");
const webhookEventsRepo = require("../../repositories/webhookEventsRepository");
const logger = require("../../lib/logger");

async function ingest(req, res) {
  // Assinatura — header `Content-HMAC: sha256=<hex>`
  const signature =
    req.get("Content-HMAC") ||
    req.get("content-hmac") ||
    req.get("X-Hub-Signature-256") ||
    "";

  // Resolve raw body em ordem de preferência:
  //   1. req.rawBody — preenchido por express.json({verify}) global
  //      (caminho normal em produção quando Content-Type=application/json)
  //   2. req.body Buffer — caminho de express.raw caso content-type não-JSON
  //   3. req.body string — caminho de express.text (defensivo)
  //
  // O fallback JSON.stringify(req.body) FOI REMOVIDO intencionalmente:
  // ele reordena chaves e quebra HMAC. Se nenhuma das opções acima entregar
  // bytes brutos, a assinatura falhará — e isso é o comportamento correto:
  // melhor 401 do que aceitar webhook que não conseguimos verificar.
  let rawBody;
  if (Buffer.isBuffer(req.rawBody)) {
    rawBody = req.rawBody;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else if (typeof req.body === "string") {
    rawBody = Buffer.from(req.body, "utf8");
  } else {
    rawBody = Buffer.alloc(0);
  }

  if (!clicksignAdapter.verifySignature({ rawBody, signatureHeader: signature })) {
    logger.warn(
      {
        ip: req.ip,
        rawBodyBytes: rawBody.length,
        rawBodySource: Buffer.isBuffer(req.rawBody) ? "rawBody" : Buffer.isBuffer(req.body) ? "body-buffer" : "body-other",
      },
      "clicksign.webhook.signature_invalid",
    );
    return res.status(401).json({ ok: false, code: "AUTH_ERROR" });
  }

  // Parse após validação — garante que só JSON autenticado chega aqui.
  // Reutiliza req.body se express.json já parseou; senão parseia rawBody.
  let body;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    body = req.body;
  } else {
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      logger.warn({ err: err?.message }, "clicksign.webhook.invalid_json");
      return res.status(400).json({ ok: false, code: "VALIDATION_ERROR" });
    }
  }

  const domainEvent = clicksignAdapter.translateWebhookEvent(body);
  if (!domainEvent) {
    // Payload não reconhecido — ClickSign evoluiu ou veio ping.
    // Responde 200 para não inflar retry.
    return res.status(200).json({ ok: true, stored: false, reason: "untranslatable" });
  }

  const record = await webhookEventsRepo.recordIfNew({
    provider: domainEvent.provider,
    provider_event_id: domainEvent.provider_event_id,
    event_type: domainEvent.event_type,
    payload: body,
  });

  if (!record.inserted) {
    logger.info(
      { providerEventId: domainEvent.provider_event_id },
      "clicksign.webhook.duplicate_ignored",
    );
    return res.status(200).json({ ok: true, stored: false, duplicate: true });
  }

  try {
    const applied = await signerService.processarEventoWebhook(domainEvent);
    await webhookEventsRepo.markProcessed(record.id);
    return res.status(200).json({ ok: true, stored: true, applied });
  } catch (err) {
    const message = err?.message ?? String(err);
    logger.error(
      { err: message, webhookEventId: record.id },
      "clicksign.webhook.domain_apply_failed",
    );
    await webhookEventsRepo.markFailed(record.id, message);
    // 200 preserva o webhook — admin reprocessa pela tela de
    // reconciliação (tela existente do Asaas serve, provider diferente).
    return res.status(200).json({
      ok: false,
      stored: true,
      applied: false,
      reason: "domain_handler_failed",
    });
  }
}

module.exports = { ingest };
