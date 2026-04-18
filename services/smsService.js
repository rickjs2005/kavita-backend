// services/smsService.js
//
// ETAPA 3.2 — facade de SMS com adapter pattern (igual pagamento).
// Hoje só Zenvia está plugado; trocar provider é trocar o SMS_PROVIDER.
//
// DECISÕES:
//   - Sempre opt-in: o produtor precisa marcar "avisar por SMS" no
//     form público. Sem opt-in, SMS NÃO é enviado — mesmo que
//     tenhamos telefone válido. LGPD + bom senso.
//   - Fire-and-forget no caller. Falha de SMS nunca bloqueia o
//     fluxo de lead/status do CRM.
//   - Sem provider configurado = no-op silencioso (log info).
"use strict";

const logger = require("../lib/logger");

const ADAPTERS = {
  zenvia: require("./sms/zenviaAdapter"),
};

function getAdapter() {
  const envChoice = (process.env.SMS_PROVIDER || "zenvia").toLowerCase();
  const adapter = ADAPTERS[envChoice];
  if (!adapter) return null;
  return adapter.isConfigured() ? adapter : null;
}

function isActive() {
  return getAdapter() !== null;
}

/**
 * Envia SMS se provider estiver configurado. Tem que ser fire-and-forget
 * no caller — esta função NÃO lança; devolve { sent, error? }.
 *
 * @param {object} opts
 * @param {string} opts.to         telefone destino (qualquer formato BR)
 * @param {string} opts.text       texto (máx 140 chars, truncado)
 * @param {string} [opts.context]  rótulo pro log (ex: "lead.contacted")
 */
async function send(opts) {
  const adapter = getAdapter();
  if (!adapter) {
    logger.info(
      { context: opts.context ?? null },
      "sms.provider_unavailable_noop",
    );
    return { sent: false, error: "provider_unavailable" };
  }
  try {
    const result = await adapter.sendSms(opts);
    if (result.sent) {
      logger.info(
        {
          provider: adapter.PROVIDER,
          context: opts.context ?? null,
          id: result.id,
        },
        "sms.sent",
      );
    } else {
      logger.warn(
        {
          provider: adapter.PROVIDER,
          context: opts.context ?? null,
          error: result.error,
          detail: result.detail,
        },
        "sms.failed",
      );
    }
    return result;
  } catch (err) {
    logger.warn(
      {
        err: err?.message ?? String(err),
        provider: adapter.PROVIDER,
        context: opts.context ?? null,
      },
      "sms.threw",
    );
    return { sent: false, error: err?.message ?? "unknown" };
  }
}

module.exports = { send, isActive };
