"use strict";

// services/whatsapp/whatsappWebhookService.js — Etapa 4 da reativacao
// (ver docs/whatsapp-reativacao.md secao 9).
//
// Responsabilidades:
//   - Verificar assinatura HMAC-SHA256 do webhook Meta Cloud (header
//     X-Hub-Signature-256: sha256=<hex>).
//   - Verificar challenge de subscricao (GET hub.challenge).
//   - Parsear payload Meta e despachar:
//       * status updates -> updateMessageStatusByProviderId
//       * mensagens inbound -> insertInbound (com idempotencia via
//         provider_message_id).
//
// Nao chama adapter de envio. Nao decide regra de negocio (lead/
// contrato sao opcionais e ficam null aqui — proxima etapa pode
// resolver via lookup por sender_phone).

const crypto = require("node:crypto");
const logger = require("../../lib/logger");
const repo = require("../../repositories/whatsappRepository");
const { toE164, maskPhone } = require("../../utils/phone");

// ---------------------------------------------------------------------------
// HMAC + verify-token
// ---------------------------------------------------------------------------

/**
 * Verifica o token de subscricao do GET inicial da Meta.
 *
 * Meta chama:
 *   GET /api/webhooks/whatsapp?hub.mode=subscribe
 *                              &hub.verify_token=<nosso-token>
 *                              &hub.challenge=<numero>
 *
 * Resposta esperada: 200 + body do challenge cru. Caso contrario 403.
 *
 * @param {object} q  query parameters do request
 * @returns {{ ok: boolean, challenge: string|null, reason: string|null }}
 */
function verifySubscription(q = {}) {
  const expected = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "");
  if (!expected) {
    return { ok: false, challenge: null, reason: "verify_token_not_configured" };
  }
  const mode = String(q["hub.mode"] || q.hub_mode || "");
  const token = String(q["hub.verify_token"] || q.hub_verify_token || "");
  const challenge = String(q["hub.challenge"] || q.hub_challenge || "");

  if (mode !== "subscribe") {
    return { ok: false, challenge: null, reason: "invalid_mode" };
  }
  if (!safeEqualString(token, expected)) {
    return { ok: false, challenge: null, reason: "invalid_token" };
  }
  return { ok: true, challenge, reason: null };
}

/**
 * Verifica HMAC-SHA256 do raw body com WHATSAPP_WEBHOOK_SECRET.
 * Header esperado: X-Hub-Signature-256: sha256=<hex>.
 * Comparacao timing-safe via crypto.timingSafeEqual.
 *
 * @param {Buffer} rawBody
 * @param {string} signatureHeader
 * @returns {boolean}
 */
function verifySignature({ rawBody, signatureHeader }) {
  const secret = String(process.env.WHATSAPP_WEBHOOK_SECRET || "");
  if (!secret) {
    logger.error("whatsapp.webhook.secret_not_configured");
    return false;
  }
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  // Aceita os formatos comuns: "sha256=abc..." ou "abc..." cru.
  const hex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqualString(hex, expected);
}

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Parse + dispatch
// ---------------------------------------------------------------------------

/**
 * Mapeia status Meta para o enum local de whatsapp_messages.
 *   sent     -> sent
 *   delivered -> delivered
 *   read     -> read
 *   failed   -> failed
 * Outros (ex.: "deleted") sao ignorados.
 */
function mapMetaStatus(metaStatus) {
  const s = String(metaStatus || "").toLowerCase();
  if (s === "sent" || s === "delivered" || s === "read" || s === "failed") {
    return s;
  }
  return null;
}

/**
 * Processa o payload Meta inteiro. Itera entry/changes e dispatcha
 * statuses + messages. Idempotente: cada item e' tratado em uma
 * transacao curta independente; falha em um nao quebra os outros.
 *
 * Retorna sumario com contadores para o caller logar/devolver.
 *
 * @param {object} payload
 * @returns {Promise<{
 *   processedStatuses: number,
 *   skippedStatuses: number,
 *   insertedInbound: number,
 *   duplicateInbound: number,
 *   ignored: number,
 *   errors: Array<{ where: string, err: string }>
 * }>}
 */
async function processWebhookPayload(payload) {
  const summary = {
    processedStatuses: 0,
    skippedStatuses: 0,
    insertedInbound: 0,
    duplicateInbound: 0,
    ignored: 0,
    errors: [],
  };

  if (!payload || typeof payload !== "object") {
    summary.ignored += 1;
    return summary;
  }

  // Meta envia object: "whatsapp_business_account". Outros objects sao
  // ignorados (configuracoes, etc.).
  if (payload.object && payload.object !== "whatsapp_business_account") {
    summary.ignored += 1;
    return summary;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      if (ch?.field !== "messages" && ch?.field !== undefined) {
        // outros fields (account_review_update etc.) — ignoramos
        summary.ignored += 1;
        continue;
      }
      const value = ch?.value || {};

      // 1) Status updates
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const s of statuses) {
        try {
          const handled = await handleStatusEvent(s);
          if (handled.updated) summary.processedStatuses += 1;
          else summary.skippedStatuses += 1;
        } catch (err) {
          summary.errors.push({
            where: `status:${s?.id || "?"}`,
            err: err?.message || String(err),
          });
        }
      }

      // 2) Mensagens inbound
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const m of messages) {
        try {
          const handled = await handleInboundMessage(m, payload);
          if (handled.inserted) summary.insertedInbound += 1;
          else if (handled.duplicate) summary.duplicateInbound += 1;
          else summary.ignored += 1;
        } catch (err) {
          summary.errors.push({
            where: `inbound:${m?.id || "?"}`,
            err: err?.message || String(err),
          });
        }
      }
    }
  }

  return summary;
}

async function handleStatusEvent(s) {
  const providerMessageId = s?.id;
  const next = mapMetaStatus(s?.status);
  if (!providerMessageId || !next) {
    return { updated: false, fromStatus: null, toStatus: null };
  }

  const ts = s?.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
  const errorMessage =
    next === "failed" && Array.isArray(s.errors) && s.errors[0]
      ? `${s.errors[0].title || s.errors[0].message || "meta_error"}` +
        (s.errors[0].code ? ` (code ${s.errors[0].code})` : "")
      : null;

  const result = await repo.updateMessageStatusByProviderId(
    providerMessageId,
    next,
    { timestamp: ts, error_message: errorMessage },
  );

  logger[result.updated ? "info" : "info"](
    {
      provider_message_id: providerMessageId,
      from_status: result.fromStatus,
      to_status: result.toStatus,
      meta_status: s?.status,
      updated: result.updated,
    },
    result.updated
      ? "whatsapp.webhook.status_updated"
      : "whatsapp.webhook.status_skipped",
  );
  return result;
}

async function handleInboundMessage(m, fullPayload) {
  const providerMessageId = m?.id;
  const fromRaw = m?.from;
  if (!providerMessageId || !fromRaw) {
    return { inserted: false, duplicate: false };
  }

  // Idempotencia
  const existing = await repo.findInboundByProviderId(providerMessageId);
  if (existing) return { inserted: false, duplicate: true };

  const sender_phone = toE164(fromRaw) || String(fromRaw);
  const ts = m?.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();

  let body = null;
  let media_url = null;

  if (m.type === "text" && m.text?.body) {
    body = String(m.text.body);
  } else if (m.type === "image" && m.image?.id) {
    media_url = `meta://media/${m.image.id}`;
    body = m.image.caption || null;
  } else if (m.type === "document" && m.document?.id) {
    media_url = `meta://media/${m.document.id}`;
    body = m.document.caption || m.document.filename || null;
  } else if (m.type === "audio" && m.audio?.id) {
    media_url = `meta://media/${m.audio.id}`;
  } else if (m.type === "video" && m.video?.id) {
    media_url = `meta://media/${m.video.id}`;
    body = m.video.caption || null;
  } else if (m.type === "button" && m.button?.text) {
    body = m.button.text;
  } else if (m.type === "interactive") {
    body = JSON.stringify(m.interactive || {});
  }

  const inserted = await repo.insertInbound({
    sender_phone,
    body,
    media_url,
    raw_payload: fullPayload,
    provider_message_id: providerMessageId,
    received_at: ts,
    lead_id: null,
    contract_id: null,
    corretora_id: null,
  });

  logger.info(
    {
      inbound_id: inserted.id,
      provider_message_id: providerMessageId,
      sender_masked: maskPhone(sender_phone),
      type: m.type || "unknown",
      body_len: body ? body.length : 0,
      has_media: Boolean(media_url),
    },
    "whatsapp.webhook.inbound_received",
  );
  return { inserted: true, duplicate: false };
}

module.exports = {
  verifySubscription,
  verifySignature,
  processWebhookPayload,
  // expostos para teste
  _internals: { handleStatusEvent, handleInboundMessage, mapMetaStatus, safeEqualString },
};
