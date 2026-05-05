"use strict";
// services/whatsapp/adapters/api.js
//
// B3 — adapter real para WhatsApp Business Cloud API (Meta).
// Substitui o stub anterior que só lançava erro pra forçar fallback
// manual. Agora envia de verdade quando WHATSAPP_PROVIDER=api +
// credenciais setadas.
//
// Sem credencial: retorna status='error' (igual ao stub antigo).
// Com credencial mas template não aprovado: Meta responde 400 e o
// adapter loga + retorna status='error'. Admin vê no log e pode
// usar manual como fallback (não auto-fallback no mesmo request).
//
// Endpoint:
//   POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
//
// Tipos de envio suportados:
//   - texto livre (só funciona dentro da janela de 24h após cliente
//     responder — fora disso, Meta retorna 400)
//   - template aprovado (recomendado para Kavita: clientes raramente
//     respondem nos primeiros minutos do pedido)
//
// Documentação:
//   https://developers.facebook.com/docs/whatsapp/cloud-api

const logger = require("../../../lib/logger");

const META_API_VERSION = process.env.WHATSAPP_API_VERSION || "v22.0";
const META_BASE_URL = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = Number(process.env.WHATSAPP_API_TIMEOUT_MS) || 8000;

// Retry exponencial — Etapa 3 da reativacao.
// Politica: re-tentar APENAS em falhas transitorias (timeout, 429,
// 5xx). Nao re-tentar em 400/401/403 — sao erros de payload ou
// credencial; insistir so' aumenta consumo de quota.
const MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.WHATSAPP_API_MAX_ATTEMPTS) || 3,
);

// Backoff padrao 500/1500/3000 ms. Override via env para testes
// (WHATSAPP_API_RETRY_BACKOFF_MS="0,0,0") evita que a suite Jest
// trave por 5s acumulando o backoff real.
function parseBackoff() {
  const raw = String(process.env.WHATSAPP_API_RETRY_BACKOFF_MS || "").trim();
  if (!raw) return [500, 1500, 3000];
  const parts = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length ? parts : [500, 1500, 3000];
}
const RETRY_BACKOFF_MS = parseBackoff();

function isRetryable(status) {
  // status === 0 é erro de rede / timeout (postWithTimeout retorna 0
  // nesses casos). 429 = rate limit. >= 500 = falha do servidor Meta.
  return status === 0 || status === 429 || (status >= 500 && status < 600);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCredentials() {
  return {
    token: process.env.WHATSAPP_API_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  };
}

/**
 * Constrói o payload do body de acordo com options.templateId.
 *
 * Sem templateId → texto livre (precisa janela 24h aberta).
 * Com templateId → template aprovado + parâmetros opcionais.
 *
 * @param {string} destino   E.164 sem "+" (ex: 5533999991234)
 * @param {string} mensagem  texto fallback (usado em modo livre)
 * @param {object} [options]
 * @param {string} [options.templateId]
 * @param {string} [options.templateLang]  default "pt_BR"
 * @param {Array<string>} [options.templateParams]  body parameters em ordem
 */
function buildBody(destino, mensagem, options = {}) {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: destino,
  };

  if (options.templateId) {
    const params = Array.isArray(options.templateParams)
      ? options.templateParams
      : [];
    return {
      ...base,
      type: "template",
      template: {
        name: options.templateId,
        language: { code: options.templateLang || "pt_BR" },
        ...(params.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: params.map((p) => ({
                    type: "text",
                    text: String(p ?? ""),
                  })),
                },
              ],
            }
          : {}),
      },
    };
  }

  return {
    ...base,
    type: "text",
    text: { body: mensagem },
  };
}

/**
 * Faz POST com timeout. Retorna { ok, status, data, errorMessage }.
 */
async function postWithTimeout(url, body, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const metaErr = data?.error || {};
      return {
        ok: false,
        status: res.status,
        data,
        errorMessage:
          metaErr.message ||
          `Meta API ${res.status}` +
            (metaErr.code ? ` (code ${metaErr.code})` : ""),
      };
    }
    return { ok: true, status: res.status, data, errorMessage: null };
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage: `Timeout após ${REQUEST_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      status: 0,
      data: null,
      errorMessage: err?.message || "Erro de rede ao chamar Meta API",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Envia mensagem via Meta Cloud API. Contrato igual ao adapter manual:
 * retorna { provider, status, url, destino, mensagem, erro }.
 *
 * Status:
 *   - "sent": Meta aceitou e retornou message id
 *   - "error": credenciais ausentes, telefone inválido, Meta rejeitou,
 *              timeout ou erro de rede. Caller decide se cai em fallback.
 *
 * Sem url no modo api (não há link wa.me — mensagem real foi enviada
 * ou tentada). Caller que precisar de fallback wa.me chama o adapter
 * manual explicitamente.
 */
async function send({ destino, mensagem, options = {} } = {}) {
  const { token, phoneNumberId } = getCredentials();

  if (!token || !phoneNumberId) {
    logger.warn(
      { destino, hasToken: !!token, hasPhoneId: !!phoneNumberId },
      "whatsapp.api.missing_credentials",
    );
    return {
      provider: "api",
      status: "error",
      url: null,
      destino,
      mensagem,
      erro:
        "Credenciais Meta ausentes — setar WHATSAPP_API_TOKEN + " +
        "WHATSAPP_PHONE_NUMBER_ID, ou voltar para WHATSAPP_PROVIDER=manual.",
    };
  }

  const url = `${META_BASE_URL}/${META_API_VERSION}/${phoneNumberId}/messages`;
  const body = buildBody(destino, mensagem, options);

  // Retry exponencial — bate Meta ate' MAX_ATTEMPTS, parando antes em
  // erros 4xx (nao-retriaveis). Cada tentativa loga separadamente
  // para que o painel/Sentry consigam reconstruir a sequencia.
  let result = null;
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    result = await postWithTimeout(url, body, token);
    if (result.ok) break;

    const retryable = isRetryable(result.status);
    logger.warn(
      {
        destino,
        attempt,
        max: MAX_ATTEMPTS,
        statusCode: result.status,
        retryable,
        templateId: options.templateId || null,
        err: result.errorMessage,
      },
      "whatsapp.api.attempt_failed",
    );

    if (!retryable || attempt >= MAX_ATTEMPTS) break;

    const wait = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1);
    await delay(wait);
  }

  if (!result.ok) {
    logger.warn(
      {
        destino,
        attempts: attempt,
        statusCode: result.status,
        templateId: options.templateId || null,
        err: result.errorMessage,
      },
      "whatsapp.api.send_failed",
    );
    return {
      provider: "api",
      status: "error",
      url: null,
      destino,
      mensagem,
      erro: result.errorMessage,
      attempts: attempt,
    };
  }

  const messageId = result.data?.messages?.[0]?.id || null;
  logger.info(
    {
      destino,
      messageId,
      attempts: attempt,
      templateId: options.templateId || null,
    },
    "whatsapp.api.sent",
  );

  return {
    provider: "api",
    status: "sent",
    url: null,
    destino,
    mensagem,
    erro: null,
    // Extra info exposta pra o caller persistir/debugar
    messageId,
    attempts: attempt,
  };
}

module.exports = { send };
