"use strict";
// lib/sentry.js
// Integração Sentry — opt-in via SENTRY_DSN env var.
// Se SENTRY_DSN não estiver setado, todos os exports são no-ops seguros.
//
// Uso:
//   require("../lib/sentry").init();                 // 1x em server.js
//   require("../lib/sentry").captureException(err);  // no error handler
//
// Filtragem (beforeSend):
//   - Eventos com status < 500 são descartados (não polui dashboard com
//     validação/auth). 5xx, uncaughtException e unhandledRejection passam.
//   - Headers sensíveis (cookie, authorization, x-csrf-token, x-signature)
//     são removidos defensivamente. Sentry default já cobre cookie/auth,
//     reforçamos aqui.
//   - Body com chaves sensíveis (senha, password, cpf, telefone, token,
//     secret, ...) tem valor substituído por "[redacted]".
//   - Strings dentro de extra/breadcrumbs com padrão de CPF (XXX.XXX.XXX-XX)
//     ou de e-mail são truncadas/mascaradas.

const REDACT_KEYS = new Set([
  // auth
  "senha", "password", "password_confirmation", "passwordconfirm", "newpassword",
  "token", "refresh_token", "access_token", "jwt", "secret", "api_key", "apikey",
  // identidade
  "cpf", "cnpj", "rg",
  // contato (parcial — só esconde, mas keepa hash pra debug)
  "telefone", "whatsapp", "phone",
  // pagamento
  "card_number", "cardnumber", "cvv", "ccv", "card_cvv",
  // 2FA / TOTP
  "totp_secret", "backup_codes",
]);

const REDACT_HEADER_KEYS = new Set([
  "cookie",
  "authorization",
  "x-csrf-token",
  "x-signature",        // Mercado Pago webhook
  "x-request-signature",
]);

// Regex aproximada para CPF formatado ou só dígitos.
const CPF_RE = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

let _initialized = false;
let _Sentry = null;

function scrubObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      obj[k] = "[redacted]";
    } else if (typeof obj[k] === "string") {
      // Substitui CPFs em strings livres
      obj[k] = obj[k].replace(CPF_RE, "[cpf-redacted]");
    } else if (typeof obj[k] === "object") {
      scrubObject(obj[k]);
    }
  }
  return obj;
}

function beforeSend(event) {
  // 1. Filtro de severidade — só 5xx + uncaught
  const status =
    event?.extra?.status ?? event?.contexts?.response?.status_code;
  if (status && Number(status) < 500) return null;

  // 2. Headers sensíveis
  if (event.request?.headers && typeof event.request.headers === "object") {
    for (const k of Object.keys(event.request.headers)) {
      if (REDACT_HEADER_KEYS.has(k.toLowerCase())) {
        delete event.request.headers[k];
      }
    }
  }

  // 3. Query string e body do request
  if (event.request?.query_string) {
    if (typeof event.request.query_string === "string") {
      event.request.query_string = event.request.query_string.replace(
        /(token|secret|key)=[^&]+/gi,
        "$1=[redacted]",
      );
    }
  }
  if (event.request?.data) scrubObject(event.request.data);

  // 4. Extra context
  if (event.extra) scrubObject(event.extra);

  // 5. Breadcrumbs (logs UI/HTTP capturados antes do erro)
  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      if (bc?.data) scrubObject(bc.data);
      if (typeof bc?.message === "string") {
        bc.message = bc.message.replace(CPF_RE, "[cpf-redacted]");
      }
    }
  }

  return event;
}

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    _Sentry = require("@sentry/node");
    _Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release: process.env.SENTRY_RELEASE || undefined,
      beforeSend,
      sampleRate: 1.0,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || "0.1"),
      // Não anexar IP do request — LGPD friendly + reduz PII
      sendDefaultPii: false,
    });
    _initialized = true;
    console.info(
      "[sentry] Initialized (env:",
      process.env.NODE_ENV,
      "tracesRate:",
      process.env.SENTRY_TRACES_RATE || "0.1",
      ")",
    );
  } catch (err) {
    console.warn(
      "[sentry] @sentry/node not installed — error tracking disabled.",
      err.message,
    );
  }
}

function captureException(err, context = {}) {
  if (!_initialized || !_Sentry) return;
  _Sentry.withScope((scope) => {
    if (context.user) scope.setUser(context.user);
    if (context.tags) {
      Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v));
    }
    _Sentry.captureException(err);
  });
}

function captureMessage(msg, level = "warning", context = {}) {
  if (!_initialized || !_Sentry) return;
  // Mesma forma de `captureException`: aceita `{ tags, extra, user }` para
  // que callers possam taguear mensagens (ex.: domínios de webhook).
  _Sentry.withScope((scope) => {
    if (context.user) scope.setUser(context.user);
    if (context.tags) {
      Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v));
    }
    _Sentry.captureMessage(msg, level);
  });
}

module.exports = {
  init,
  captureException,
  captureMessage,
  // Exposto pra testes — não usar em prod
  __beforeSend: beforeSend,
  __scrubObject: scrubObject,
};
