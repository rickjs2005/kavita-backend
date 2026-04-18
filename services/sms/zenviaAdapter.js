// services/sms/zenviaAdapter.js
//
// ETAPA 3.2 — adapter SMS Zenvia. Feature-flagged via ZENVIA_TOKEN.
// Sem token → isConfigured()=false e o smsService vira no-op.
//
// Zenvia SMS API v1:
//   POST https://api.zenvia.com/v2/channels/sms/messages
//   Headers: X-API-TOKEN
//   Body: { from, to, contents: [{ type: "text", text }] }
//
// "from" é o alias configurado na conta Zenvia. "to" é DDI+número.
// Retry & entrega nativamente pela Zenvia.
"use strict";

const PROVIDER = "zenvia";
const ENDPOINT =
  process.env.ZENVIA_ENDPOINT ||
  "https://api.zenvia.com/v2/channels/sms/messages";

function isConfigured() {
  return Boolean(process.env.ZENVIA_TOKEN) && Boolean(process.env.ZENVIA_SMS_FROM);
}

/**
 * Normaliza telefone brasileiro → formato Zenvia (E.164 sem "+").
 * Ex.: "(33) 9 9999-0000" → "5533999990000"
 */
function normalize(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 || digits.length === 10) {
    return `55${digits}`;
  }
  if (digits.length === 13 || digits.length === 12) {
    return digits;
  }
  return null;
}

/**
 * Envia SMS. Fire-and-forget — o caller trata falha com log.
 * Retorna { sent: boolean, id?: string, error?: string }.
 */
async function sendSms({ to, text }) {
  if (!isConfigured()) {
    return { sent: false, error: "provider_not_configured" };
  }
  const normalized = normalize(to);
  if (!normalized) {
    return { sent: false, error: "invalid_phone" };
  }
  const body = JSON.stringify({
    from: process.env.ZENVIA_SMS_FROM,
    to: normalized,
    contents: [{ type: "text", text: String(text).slice(0, 140) }],
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-TOKEN": process.env.ZENVIA_TOKEN,
    },
    body,
    // Timeout curto — evita pendurar o fluxo do webhook
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      sent: false,
      error: `zenvia_http_${res.status}`,
      detail: errText.slice(0, 200),
    };
  }
  const json = await res.json().catch(() => ({}));
  return { sent: true, id: json?.id ?? null };
}

module.exports = { PROVIDER, isConfigured, sendSms, normalize };
