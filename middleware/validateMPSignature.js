// middleware/validateMPSignature.js
"use strict";

/**
 * Middleware: valida a assinatura HMAC-SHA256 dos webhooks do Mercado Pago.
 *
 * Formato do header x-signature: "ts=<timestamp>,v1=<hmac-sha256-hex>"
 *
 * O manifesto assinado pelo MP segue o padrão oficial:
 *   "id:{data_id};request-id:{x-request-id};ts:{ts};"
 *
 * Ref: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * Retorna 401 em caso de falha de validação.
 * Em caso de MP_WEBHOOK_SECRET não configurado em produção, retorna 500.
 * Em desenvolvimento sem secret, deixa passar (com aviso).
 */

const crypto = require("crypto");

/**
 * Parseia o header x-signature em { ts, v1 }.
 * @param {string} header
 * @returns {{ ts: string|null, v1: string|null }}
 */
function parseSignatureHeader(header) {
  if (!header) return { ts: null, v1: null };

  const parts = String(header)
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((acc, [key, ...rest]) => {
      // Junta de volta caso value contenha "=" (ex: base64 padding)
      if (key) acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});

  return { ts: parts.ts || null, v1: parts.v1 || null };
}

/**
 * Constrói o manifesto assinado no formato oficial do Mercado Pago:
 *   "id:{data_id};request-id:{request_id};ts:{ts};"
 *
 * Componentes opcionais são omitidos se não presentes.
 *
 * @param {{ dataId?: string|number, requestId?: string, ts: string }} opts
 * @returns {string}
 */
function buildSignedManifest({ dataId, requestId, ts }) {
  let manifest = "";
  if (dataId != null && dataId !== "") manifest += `id:${dataId};`;
  if (requestId != null && requestId !== "") manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

/**
 * Compara dois hex strings de forma timing-safe.
 * Retorna false se os inputs não forem hex válidos ou tiverem tamanhos diferentes.
 * @param {string} a - hex string
 * @param {string} b - hex string
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  const hexRe = /^[0-9a-fA-F]+$/;
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!hexRe.test(a) || !hexRe.test(b)) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware que valida a assinatura HMAC-SHA256 do webhook do Mercado Pago.
 * Em caso de sucesso, popula req.mpSignature = { ts, v1, manifest } para uso posterior.
 * Em caso de falha de autenticação, chama req.rateLimit.fail() para acionar o
 * rate limiter adaptativo global (server.js).
 */
function validateMPSignature(req, res, next) {
  const signatureHeader = req.get("x-signature");
  const secret = process.env.MP_WEBHOOK_SECRET;

  // Helper: registra falha no rate limiter e responde
  const rejectUnauthorized = () => {
    if (typeof req.rateLimit?.fail === "function") req.rateLimit.fail();
    return res.status(401).json({ ok: false });
  };

  // Secret não configurado
  if (!secret) {
    console.error("[validateMPSignature] MP_WEBHOOK_SECRET não configurado");
    // Em produção, falha de forma segura; em dev, avisa e deixa passar
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({ ok: false, error: "Webhook secret not configured" });
    }
    console.warn("[validateMPSignature] Ignorando validação de assinatura em ambiente não-produção");
    return next();
  }

  if (!signatureHeader) {
    console.warn("[validateMPSignature] Header x-signature ausente");
    return rejectUnauthorized();
  }

  const { ts, v1: providedHash } = parseSignatureHeader(signatureHeader);

  if (!ts || !providedHash) {
    console.warn("[validateMPSignature] Formato de x-signature inválido:", signatureHeader);
    return rejectUnauthorized();
  }

  // Extrai componentes do manifesto
  const dataId = req.body?.data?.id ?? null;
  const requestId = req.get("x-request-id") ?? null;

  const manifest = buildSignedManifest({ dataId, requestId, ts });

  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (!timingSafeEqual(expectedHash, providedHash)) {
    console.warn("[validateMPSignature] Assinatura inválida. Manifest:", manifest);
    return rejectUnauthorized();
  }

  // Disponibiliza dados parseados para o handler
  req.mpSignature = { ts, v1: providedHash, manifest };
  return next();
}

module.exports = validateMPSignature;
// Exporta helpers para facilitar testes unitários
module.exports.parseSignatureHeader = parseSignatureHeader;
module.exports.buildSignedManifest = buildSignedManifest;
module.exports.timingSafeEqual = timingSafeEqual;
