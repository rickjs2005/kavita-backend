// services/contratos/clicksignAdapter.js
//
// Adapter ClickSign para o módulo de contratos (Fase 10.1 — PR 2).
//
// Responsabilidades:
//   1. Falar com a API ClickSign v3 (envelopes + documentos + signatários)
//   2. Validar HMAC do webhook (raw body + chave secreta do painel)
//   3. Traduzir evento ClickSign em "domain event" enxuto para o
//      contratoSignerService não precisar conhecer o formato JSON:API
//
// Princípios:
//   - `isConfigured()` permite ao chamador fazer fallback gracioso
//     para stub quando nenhuma das 3 envs está setada
//   - `verifySignature()` compara com `timingSafeEqual` sobre raw body
//   - Nenhuma regra de negócio aqui — só I/O e tradução
"use strict";

const crypto = require("crypto");

const logger = require("../../lib/logger");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_API_URL = "https://sandbox.clicksign.com";

class ClickSignError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = "ClickSignError";
    this.status = status;
    this.body = body;
  }
}

class NotConfiguredError extends Error {
  constructor() {
    super("ClickSign não configurado (faltam CLICKSIGN_API_TOKEN e/ou CLICKSIGN_API_URL).");
    this.name = "NotConfiguredError";
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    apiToken: process.env.CLICKSIGN_API_TOKEN || "",
    apiUrl: process.env.CLICKSIGN_API_URL || DEFAULT_API_URL,
    hmacSecret: process.env.CLICKSIGN_HMAC_SECRET || "",
  };
}

function isConfigured() {
  const { apiToken, hmacSecret } = getConfig();
  return Boolean(apiToken && hmacSecret);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function _request(path, { method = "GET", body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cfg = getConfig();
  if (!cfg.apiToken) throw new NotConfiguredError();

  const url = `${cfg.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        // ClickSign v3 aceita token no header Authorization SEM prefixo
        // Bearer. Com "Bearer <token>" a API devolve 401 "Access Token
        // inválido". Confirmado via smoke em sandbox.clicksign.com.
        Authorization: cfg.apiToken,
        Accept: "application/json",
        "User-Agent": "Kavita/1.0 (contratos)",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ClickSignError(
      err?.name === "AbortError"
        ? "ClickSign: timeout na requisição."
        : `ClickSign: erro de rede — ${err?.message ?? "desconhecido"}.`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    throw new ClickSignError(
      `ClickSign: HTTP ${res.status}`,
      { status: res.status, body: parsed },
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Envelope / documento / signatários
// ---------------------------------------------------------------------------

/**
 * Cria envelope com 1 documento + N signatários + requirements (sign
 * + auth por email) e dispara o envio.
 *
 * Fluxo ClickSign v3 (JSON:API):
 *   1) POST /envelopes                     → cria envelope em draft
 *   2) POST /envelopes/:id/documents       → anexa PDF base64
 *   3) POST /envelopes/:id/signers         → 1x por signatário
 *   4) POST /envelopes/:id/requirements    → 2x por signer (sign + auth=email)
 *   5) PATCH /envelopes/:id status=running → envia notificação
 *
 * Todos os bodies seguem formato JSON:API: { data: { type, attributes,
 * relationships } }. Chamadas antigas ao estilo { envelope: {...} } dão
 * 400 "data deve ser informado".
 */
async function criarEnvelopeCompleto({
  nomeEnvelope,
  pdfBuffer,
  signers,
}) {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new ClickSignError("Signatários são obrigatórios.");
  }
  for (const s of signers) {
    if (!s?.name || !s?.email) {
      throw new ClickSignError(
        "Cada signatário precisa de name e email.",
      );
    }
  }

  // 1) Cria envelope
  const envelope = await _request("/api/v3/envelopes", {
    method: "POST",
    body: {
      data: {
        type: "envelopes",
        attributes: {
          name: nomeEnvelope,
          locale: "pt-BR",
          auto_close: true,
          block_after_refusal: true,
        },
      },
    },
  });
  const envelopeId = envelope?.data?.id ?? null;
  if (!envelopeId) {
    throw new ClickSignError("ClickSign não devolveu envelope id.", {
      body: envelope,
    });
  }

  // 2) Anexa PDF (base64)
  const documentCreate = await _request(
    `/api/v3/envelopes/${envelopeId}/documents`,
    {
      method: "POST",
      body: {
        data: {
          type: "documents",
          attributes: {
            filename: `${nomeEnvelope}.pdf`,
            content_base64: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
          },
        },
      },
    },
  );
  const documentId = documentCreate?.data?.id ?? null;
  if (!documentId) {
    throw new ClickSignError("ClickSign não devolveu document id.", {
      body: documentCreate,
    });
  }

  // 3) Adiciona signatários + 4) Requirements (sign + auth=email)
  const signerIds = [];
  for (const s of signers) {
    const createdSigner = await _request(
      `/api/v3/envelopes/${envelopeId}/signers`,
      {
        method: "POST",
        body: {
          data: {
            type: "signers",
            attributes: {
              name: s.name,
              email: s.email,
              has_documentation: Boolean(s.cpf),
              documentation: s.cpf ?? null,
              // Sem birthday/refusable — fica no default do provedor.
            },
          },
        },
      },
    );
    const signerId = createdSigner?.data?.id ?? null;
    if (!signerId) {
      throw new ClickSignError("ClickSign não devolveu signer id.", {
        body: createdSigner,
      });
    }
    signerIds.push(signerId);

    // 4a) requirement "agree" — obrigação de assinar o documento.
    // ClickSign v3 exige `role: "sign"` aqui.
    await _request(`/api/v3/envelopes/${envelopeId}/requirements`, {
      method: "POST",
      body: {
        data: {
          type: "requirements",
          attributes: { action: "agree", role: "sign" },
          relationships: {
            document: { data: { type: "documents", id: documentId } },
            signer: { data: { type: "signers", id: signerId } },
          },
        },
      },
    });

    // 4b) requirement "provide_evidence" — método de autenticação.
    // NÃO aceita role (aceita apenas action + auth). Enviar role aqui
    // causa "role não está disponível".
    await _request(`/api/v3/envelopes/${envelopeId}/requirements`, {
      method: "POST",
      body: {
        data: {
          type: "requirements",
          attributes: { action: "provide_evidence", auth: "email" },
          relationships: {
            document: { data: { type: "documents", id: documentId } },
            signer: { data: { type: "signers", id: signerId } },
          },
        },
      },
    });
  }

  // 5) Dispara envio (status=running)
  await _request(`/api/v3/envelopes/${envelopeId}`, {
    method: "PATCH",
    body: {
      data: {
        type: "envelopes",
        id: envelopeId,
        attributes: { status: "running" },
      },
    },
  });

  return { envelopeId, documentId, signerIds };
}

/**
 * Baixa o PDF assinado final. ClickSign v3 expõe a URL em
 * `data.links.files.signed` no endpoint nested do envelope. A URL é
 * pré-assinada S3 e expira em ~5 minutos — baixar imediatamente.
 */
async function baixarPdfAssinado({ envelopeId, documentId }) {
  if (!envelopeId || !documentId) {
    throw new ClickSignError("envelopeId e documentId são obrigatórios.");
  }
  const meta = await _request(
    `/api/v3/envelopes/${envelopeId}/documents/${documentId}`,
  );
  const downloadUrl = meta?.data?.links?.files?.signed ?? null;
  if (!downloadUrl) {
    throw new ClickSignError(
      "ClickSign não devolveu links.files.signed.",
      { body: meta },
    );
  }
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new ClickSignError(
      `ClickSign: falha ao baixar PDF assinado (HTTP ${res.status}).`,
    );
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Valida HMAC-SHA256 do webhook ClickSign. A plataforma envia header
 * `Content-HMAC: sha256=<hex>` calculado sobre o raw body bruto com
 * a chave secreta definida no painel.
 *
 * Espera `rawBody` como Buffer ou string. Rota deve montar
 * express.raw({ type: '*\/*' }) para preservar os bytes exatos.
 */
function verifySignature({ rawBody, signatureHeader }) {
  const cfg = getConfig();
  if (!cfg.hmacSecret) {
    logger.error("clicksign.webhook.hmac_not_configured");
    return false;
  }
  if (!signatureHeader) return false;

  // Aceita formato `sha256=<hex>` ou apenas `<hex>` (alguns headers antigos)
  const match = /^(?:sha256=)?([a-f0-9]{64})$/i.exec(String(signatureHeader).trim());
  if (!match) return false;
  const receivedHex = match[1].toLowerCase();

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ""), "utf8");
  const expectedHex = crypto
    .createHmac("sha256", cfg.hmacSecret)
    .update(payload)
    .digest("hex");

  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(receivedHex, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Converte payload nativo da ClickSign em "domain event" enxuto:
 *   { provider_event_id, event_type, document_id, status_hint, raw }
 *
 * Retorna null para eventos que não nos interessam — o controller
 * responde 200 sem side-effect, mantendo a ClickSign feliz.
 */
function translateWebhookEvent(body) {
  if (!body || typeof body !== "object") return null;
  const eventName = body?.event?.name ?? body?.event_name ?? null;
  if (!eventName) return null;

  // document.key é o document_id que persistimos em signer_document_id
  const documentId =
    body?.document?.key ?? body?.event?.data?.document?.key ?? null;
  const occurredAt =
    body?.event?.occurred_at ?? body?.occurred_at ?? new Date().toISOString();

  const providerEventId = `${documentId ?? "no-doc"}:${eventName}:${occurredAt}`;

  const mapped = {
    provider: "clicksign",
    provider_event_id: providerEventId,
    event_type: eventName,
    document_id: documentId,
    occurred_at: occurredAt,
    raw: body,
  };

  if (["auto_close", "close"].includes(eventName)) {
    mapped.status_hint = "signed";
    return mapped;
  }
  if (eventName === "cancel") {
    mapped.status_hint = "cancelled";
    mapped.cancel_reason = "cancelado pela ClickSign";
    return mapped;
  }
  if (eventName === "refuse") {
    mapped.status_hint = "cancelled";
    mapped.cancel_reason = "recusado por signatário";
    return mapped;
  }
  if (eventName === "deadline") {
    mapped.status_hint = "expired";
    return mapped;
  }

  // sign (assinou parcial), add_signer, etc. — registra mas não transiciona
  mapped.status_hint = null;
  return mapped;
}

module.exports = {
  isConfigured,
  criarEnvelopeCompleto,
  baixarPdfAssinado,
  verifySignature,
  translateWebhookEvent,
  ClickSignError,
  NotConfiguredError,
};
