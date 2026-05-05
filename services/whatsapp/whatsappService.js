"use strict";

// services/whatsapp/whatsappService.js — Etapa 3 da reativacao
// (ver docs/whatsapp-reativacao.md secao 8).
//
// Service consolidado para o fluxo Mercado do Cafe (corretora).
// Diferente do facade legado (services/whatsapp/index.js) usado pelo
// modulo Pedidos:
//   - persiste cada envio em whatsapp_messages (logs estruturados)
//   - resolve template versionado por (key, version) e renderiza
//     placeholders {{var}} a partir do payload
//   - registra `provider` e `language_code` para auditoria
//   - traduz status de adapter para o enum da tabela
//     (queued_stub / manual_pending / sent / failed)
//   - retorno de dominio: { ok, message_id?, status?, code?, message? }
//
// API publica:
//
//   sendMessage({
//     key,                  // string. Ex.: "corretora_lead_recebido".
//     variables,            // { nome_corretora: "X", ... }
//     to,                   // telefone bruto ou normalizado.
//     lead_id,              // opcional
//     contract_id,          // opcional
//     corretora_id,         // opcional
//     language_code,        // opcional, override (default: do template)
//     version,              // opcional, default: maior version active=1
//     metadata,             // opcional, livre (atualmente nao persiste —
//                           //   reservado para futuro)
//     provider,             // opcional, override do default WHATSAPP_PROVIDER
//   }) → Promise<Result>
//
//   sendFreeText({
//     to,                   // telefone bruto
//     text,                 // mensagem livre (janela 24h Meta)
//     lead_id, contract_id, corretora_id, language_code,
//     metadata, provider,
//   }) → Promise<Result>
//
// Result (sucesso):
//   { ok: true, message_id, status, provider, provider_message_id, language_code }
//
// Result (erro de dominio — antes de chamar adapter):
//   { ok: false, code, message }
//
// Codigos de erro (usam os ERROR_CODES existentes onde fizer sentido):
//   - VALIDATION_ERROR: telefone invalido, key vazia, variables invalidas
//   - NOT_FOUND:        template inexistente
//   - CONFLICT:         template existe mas active=0
//   - SERVER_ERROR:     adapter falhou apos retries (ja registra failed
//                       em whatsapp_messages)

const crypto = require("node:crypto");
const logger = require("../../lib/logger");
const ERROR_CODES = require("../../constants/ErrorCodes");
const repo = require("../../repositories/whatsappRepository");
const { toE164, validateBR, maskPhone } = require("../../utils/phone");

const manualAdapter = require("./adapters/manual");
const apiAdapter = require("./adapters/api");
const stubAdapter = require("./adapters/stub");

const SUPPORTED_PROVIDERS = new Set(["manual", "api", "stub"]);

// ---------------------------------------------------------------------------
// Provider resolution — separado do facade legado para nao mudar
// comportamento do modulo Pedidos. Default deste service no sprint
// e' "stub" (briefing Etapa 3); em prod, alinhado a' env quando ela
// for setada para um valor suportado.
// ---------------------------------------------------------------------------
function resolveProvider(override) {
  const explicit = (override || "").toLowerCase();
  if (SUPPORTED_PROVIDERS.has(explicit)) return explicit;

  const fromEnv = String(process.env.WHATSAPP_PROVIDER || "").toLowerCase();
  if (SUPPORTED_PROVIDERS.has(fromEnv)) return fromEnv;

  return "stub";
}

function getAdapter(provider) {
  if (provider === "api") return apiAdapter;
  if (provider === "manual") return manualAdapter;
  return stubAdapter;
}

// ---------------------------------------------------------------------------
// Render do body — substitui {{var}} pelo valor de variables[var].
// Variavel ausente vira string vazia (Meta nao aceita undefined no
// payload; o vazio e' melhor que erro de runtime).
// ---------------------------------------------------------------------------
function renderTemplateBody(body, variables = {}) {
  return String(body).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    const v = variables[name];
    return v == null ? "" : String(v);
  });
}

// ---------------------------------------------------------------------------
// Mapeamento status do adapter -> enum da coluna whatsapp_messages.
// ---------------------------------------------------------------------------
function mapDbStatus(provider, adapterStatus) {
  if (adapterStatus === "error") return "failed";
  if (provider === "api" && adapterStatus === "sent") return "sent";
  if (provider === "manual" && adapterStatus === "manual_pending") {
    return "manual_pending";
  }
  if (provider === "stub" && adapterStatus === "queued_stub") {
    return "queued_stub";
  }
  // Fallback defensivo: nao quebra, mas registra nos logs
  // estruturados para diagnostico.
  return "queued";
}

function correlationId() {
  return `wa_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Logging estruturado — mascarar PII (telefone) + nao logar body
// completo (apenas comprimento).
// ---------------------------------------------------------------------------
function logCtx({ correlation, provider, key, language_code, lead_id, contract_id, corretora_id, to }) {
  return {
    correlation,
    provider,
    template_key: key || null,
    language_code: language_code || null,
    lead_id: lead_id ?? null,
    contract_id: contract_id ?? null,
    corretora_id: corretora_id ?? null,
    recipient_masked: maskPhone(to) || null,
  };
}

// ---------------------------------------------------------------------------
// sendMessage — fluxo principal por template.
// ---------------------------------------------------------------------------
async function sendMessage(input = {}) {
  const {
    key,
    variables = {},
    to,
    lead_id = null,
    contract_id = null,
    corretora_id = null,
    language_code: overrideLang,
    version,
    metadata,
    provider: providerOverride,
  } = input;

  const correlation = correlationId();

  // 1) Validacoes de input
  if (!key || typeof key !== "string") {
    return {
      ok: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "key (template) é obrigatório.",
    };
  }
  if (!validateBR(to)) {
    logger.warn(
      { correlation, recipient_masked: maskPhone(to) || null, key },
      "whatsapp.send.invalid_phone",
    );
    return {
      ok: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Telefone destinatário inválido (esperado E.164 BR).",
    };
  }

  // 2) Resolve template ativo
  const tpl = await repo.findActiveTemplate(key, version ?? null);
  if (!tpl) {
    // Distingue inexistente x desativado para o caller saber se
    // precisa cadastrar/ativar.
    const any = await repo.findAnyTemplate(key, version ?? null);
    if (!any) {
      return {
        ok: false,
        code: ERROR_CODES.NOT_FOUND,
        message: `Template '${key}' não encontrado.`,
      };
    }
    return {
      ok: false,
      code: ERROR_CODES.CONFLICT,
      message: `Template '${key}' (v${any.version}) está inativo. Ative-o no admin antes de disparar.`,
    };
  }

  // 3) Resolve provider + language_code efetivo
  const provider = resolveProvider(providerOverride);
  const language_code = overrideLang || tpl.language_code;
  const destino = toE164(to);
  const body = renderTemplateBody(tpl.body, variables);

  // 4) Insert em whatsapp_messages com status de pre-envio
  const preStatus =
    provider === "api"
      ? "queued"
      : provider === "manual"
        ? "manual_pending"
        : "queued_stub";

  const inserted = await repo.insertMessage({
    lead_id,
    contract_id,
    corretora_id,
    recipient_phone: destino,
    template_key: key,
    body,
    provider,
    status: preStatus,
    language_code,
  });

  logger.info(
    {
      ...logCtx({ correlation, provider, key, language_code, lead_id, contract_id, corretora_id, to: destino }),
      message_id: inserted.id,
      pre_status: preStatus,
    },
    "whatsapp.send.queued",
  );

  // 5) Chama adapter
  const adapter = getAdapter(provider);

  // Para o adapter API, usar template aprovado (meta_template_name)
  // se ja' homologado. No sprint todos meta_template_name=NULL ->
  // adapter API enviaria texto livre (rejeita fora janela 24h).
  // Por seguranca: sem meta_template_name + provider api = falha
  // controlada de dominio antes de bater na Meta.
  const adapterOptions =
    provider === "api" && tpl.meta_template_name
      ? {
          templateId: tpl.meta_template_name,
          templateLang: language_code,
          templateParams: extractTemplateParams(body, tpl, variables),
        }
      : {};

  if (provider === "api" && !tpl.meta_template_name) {
    await repo.updateMessageResult(inserted.id, {
      status: "failed",
      error_message:
        "Template ativo mas sem meta_template_name — submeta o template à Meta antes de habilitar provider=api.",
      failed_at: new Date(),
    });
    logger.warn(
      { ...logCtx({ correlation, provider, key, language_code, lead_id, contract_id, corretora_id, to: destino }), message_id: inserted.id },
      "whatsapp.send.failed_missing_meta_template_name",
    );
    return {
      ok: false,
      code: ERROR_CODES.CONFLICT,
      message:
        "Template ativo mas sem meta_template_name. Cutover Meta pendente.",
      message_id: inserted.id,
    };
  }

  let adapterResult;
  try {
    adapterResult = await adapter.send({
      destino,
      mensagem: body,
      options: adapterOptions,
    });
  } catch (err) {
    adapterResult = {
      provider,
      status: "error",
      url: null,
      destino,
      mensagem: body,
      erro: err?.message || "adapter.exception",
    };
  }

  // 6) Update do registro com o resultado
  const finalStatus = mapDbStatus(provider, adapterResult.status);
  const isOk = finalStatus !== "failed";
  const now = new Date();

  await repo.updateMessageResult(inserted.id, {
    status: finalStatus,
    provider_message_id: adapterResult.messageId || null,
    error_message: adapterResult.erro || null,
    retry_count: adapterResult.attempts ?? 0,
    sent_at: finalStatus === "sent" ? now : null,
    failed_at: finalStatus === "failed" ? now : null,
  });

  // 7) Log estruturado final
  logger[isOk ? "info" : "warn"](
    {
      ...logCtx({ correlation, provider, key, language_code, lead_id, contract_id, corretora_id, to: destino }),
      message_id: inserted.id,
      status: finalStatus,
      provider_message_id: adapterResult.messageId || null,
      attempts: adapterResult.attempts ?? null,
      err: adapterResult.erro || null,
      // Tamanho do body em vez do conteudo — evita PII em log.
      body_len: body.length,
    },
    isOk ? "whatsapp.send.completed" : "whatsapp.send.failed",
  );

  // metadata e' aceito no contrato mas hoje nao persiste na tabela —
  // reservado para coluna metadata JSON em sprint futura. Mantemos
  // no log estruturado para correlacao se util.
  if (metadata) {
    logger.info(
      { correlation, message_id: inserted.id, metadata_keys: Object.keys(metadata) },
      "whatsapp.send.metadata",
    );
  }

  if (!isOk) {
    return {
      ok: false,
      code: ERROR_CODES.SERVER_ERROR,
      message: "Falha no envio via provider WhatsApp.",
      message_id: inserted.id,
      status: finalStatus,
      provider,
    };
  }

  return {
    ok: true,
    message_id: inserted.id,
    status: finalStatus,
    provider,
    provider_message_id: adapterResult.messageId || null,
    language_code,
  };
}

/**
 * Constroi a lista ordenada de parametros para o template Meta com
 * base nas variaveis declaradas pelo template + payload do caller.
 */
function extractTemplateParams(_renderedBody, tpl, variables) {
  let declared = [];
  if (Array.isArray(tpl.variables)) {
    declared = tpl.variables;
  } else if (typeof tpl.variables === "string") {
    try {
      const parsed = JSON.parse(tpl.variables);
      if (Array.isArray(parsed)) declared = parsed;
    } catch {
      declared = [];
    }
  }
  return declared.map((name) => {
    const v = variables[name];
    return v == null ? "" : String(v);
  });
}

// ---------------------------------------------------------------------------
// sendFreeText — texto livre (janela 24h Meta). Util para resposta a
// inbound do produtor. Persiste em whatsapp_messages com
// template_key=NULL.
// ---------------------------------------------------------------------------
async function sendFreeText(input = {}) {
  const {
    to,
    text,
    lead_id = null,
    contract_id = null,
    corretora_id = null,
    language_code: overrideLang,
    metadata,
    provider: providerOverride,
  } = input;

  const correlation = correlationId();

  if (!text || typeof text !== "string" || !text.trim()) {
    return {
      ok: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "text é obrigatório.",
    };
  }
  if (!validateBR(to)) {
    return {
      ok: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Telefone destinatário inválido (esperado E.164 BR).",
    };
  }

  const provider = resolveProvider(providerOverride);
  const language_code = overrideLang || "pt_BR";
  const destino = toE164(to);
  const body = text.trim();

  const preStatus =
    provider === "api"
      ? "queued"
      : provider === "manual"
        ? "manual_pending"
        : "queued_stub";

  const inserted = await repo.insertMessage({
    lead_id,
    contract_id,
    corretora_id,
    recipient_phone: destino,
    template_key: null,
    body,
    provider,
    status: preStatus,
    language_code,
  });

  logger.info(
    {
      ...logCtx({ correlation, provider, key: null, language_code, lead_id, contract_id, corretora_id, to: destino }),
      message_id: inserted.id,
      pre_status: preStatus,
      free_text: true,
    },
    "whatsapp.send.queued",
  );

  let adapterResult;
  try {
    adapterResult = await getAdapter(provider).send({
      destino,
      mensagem: body,
      options: {}, // texto livre — sem template_id
    });
  } catch (err) {
    adapterResult = {
      provider,
      status: "error",
      erro: err?.message || "adapter.exception",
    };
  }

  const finalStatus = mapDbStatus(provider, adapterResult.status);
  const isOk = finalStatus !== "failed";
  const now = new Date();

  await repo.updateMessageResult(inserted.id, {
    status: finalStatus,
    provider_message_id: adapterResult.messageId || null,
    error_message: adapterResult.erro || null,
    retry_count: adapterResult.attempts ?? 0,
    sent_at: finalStatus === "sent" ? now : null,
    failed_at: finalStatus === "failed" ? now : null,
  });

  logger[isOk ? "info" : "warn"](
    {
      ...logCtx({ correlation, provider, key: null, language_code, lead_id, contract_id, corretora_id, to: destino }),
      message_id: inserted.id,
      status: finalStatus,
      provider_message_id: adapterResult.messageId || null,
      err: adapterResult.erro || null,
      body_len: body.length,
      free_text: true,
    },
    isOk ? "whatsapp.send.completed" : "whatsapp.send.failed",
  );

  if (metadata) {
    logger.info(
      { correlation, message_id: inserted.id, metadata_keys: Object.keys(metadata) },
      "whatsapp.send.metadata",
    );
  }

  if (!isOk) {
    return {
      ok: false,
      code: ERROR_CODES.SERVER_ERROR,
      message: "Falha no envio (texto livre) via provider WhatsApp.",
      message_id: inserted.id,
      status: finalStatus,
      provider,
    };
  }

  return {
    ok: true,
    message_id: inserted.id,
    status: finalStatus,
    provider,
    provider_message_id: adapterResult.messageId || null,
    language_code,
  };
}

module.exports = {
  sendMessage,
  sendFreeText,
  // expostos para teste — facilita injetar mocks de pieces internas
  _internals: { renderTemplateBody, mapDbStatus, resolveProvider },
};
