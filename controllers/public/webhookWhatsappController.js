"use strict";
// controllers/public/webhookWhatsappController.js — Etapa 4 da
// reativacao (ver docs/whatsapp-reativacao.md secao 9).
//
// Webhook Meta Cloud (WhatsApp Business). Sem auth — a seguranca e':
//   - GET de verificacao: token compartilhado WHATSAPP_WEBHOOK_VERIFY_TOKEN.
//   - POST de evento:    HMAC-SHA256 sobre o raw body, secret
//                        WHATSAPP_WEBHOOK_SECRET; header
//                        X-Hub-Signature-256: sha256=<hex>.
//
// Resposta:
//   - GET 200 com body do hub.challenge cru (caso verify ok).
//   - GET 403 quando token invalido.
//   - POST 401 quando assinatura invalida.
//   - POST 200 sempre nos demais casos (Meta nao aceita 4xx no
//     webhook salvo o 401 inicial — qualquer outro 4xx resulta em
//     desabilitacao do webhook).

const logger = require("../../lib/logger");
const webhookSvc = require("../../services/whatsapp/whatsappWebhookService");

// ---------------------------------------------------------------------------
// GET /api/webhooks/whatsapp — Meta verifica nossa URL ao subscrever.
// ---------------------------------------------------------------------------
async function verify(req, res) {
  const result = webhookSvc.verifySubscription(req.query || {});
  if (!result.ok) {
    logger.warn(
      { ip: req.ip, reason: result.reason },
      "whatsapp.webhook.verify_failed",
    );
    return res.status(403).type("text/plain").send("forbidden");
  }
  // Meta espera o challenge cru, nao JSON.
  return res.status(200).type("text/plain").send(result.challenge);
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/whatsapp — eventos de status + inbound.
// ---------------------------------------------------------------------------
async function ingest(req, res) {
  // Header Meta: X-Hub-Signature-256: sha256=<hex>.
  const signature =
    req.get("X-Hub-Signature-256") ||
    req.get("x-hub-signature-256") ||
    "";

  // Resolve raw body — ordem identica a do webhookClicksignController:
  //   1. req.rawBody (preenchido por express.json verify global)
  //   2. req.body Buffer (express.raw quando content-type nao-JSON)
  //   3. req.body string (express.text — defensivo)
  // Sem JSON.stringify() de fallback: reordenaria chaves e quebraria HMAC.
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

  if (!webhookSvc.verifySignature({ rawBody, signatureHeader: signature })) {
    logger.warn(
      {
        ip: req.ip,
        rawBodyBytes: rawBody.length,
        rawBodySource: Buffer.isBuffer(req.rawBody)
          ? "rawBody"
          : Buffer.isBuffer(req.body)
            ? "body-buffer"
            : "body-other",
        hasSignatureHeader: Boolean(signature),
      },
      "whatsapp.webhook.signature_invalid",
    );
    return res.status(401).json({ ok: false, code: "AUTH_ERROR" });
  }

  // Parse — assinatura ja validada, podemos confiar no JSON.
  let body;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    body = req.body;
  } else {
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      logger.warn(
        { err: err?.message },
        "whatsapp.webhook.invalid_json",
      );
      // 200 mesmo assim (Meta nao aceita 4xx repetido no webhook).
      return res.status(200).json({ ok: false, reason: "invalid_json" });
    }
  }

  let summary;
  try {
    summary = await webhookSvc.processWebhookPayload(body);
  } catch (err) {
    logger.error(
      { err: err?.message ?? String(err) },
      "whatsapp.webhook.process_failed",
    );
    // 200 mesmo em erro de dominio para nao acionar retries da Meta.
    return res.status(200).json({ ok: false, reason: "process_failed" });
  }

  if (summary.errors.length) {
    logger.warn(
      { errors: summary.errors, summary },
      "whatsapp.webhook.partial_errors",
    );
  } else {
    logger.info({ summary }, "whatsapp.webhook.processed");
  }

  return res.status(200).json({ ok: true, summary });
}

module.exports = { verify, ingest };
