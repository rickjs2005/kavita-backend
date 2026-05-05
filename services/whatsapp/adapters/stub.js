"use strict";

// services/whatsapp/adapters/stub.js
//
// Adapter "stub" — terceiro modo do facade WhatsApp.
//
// Uso:
//   - Default no sprint de reativacao (WHATSAPP_PROVIDER=stub).
//   - CI / testes integracao sem rede.
//   - Smoke local sem WhatsApp Web nem credencial Meta.
//
// Comportamento:
//   - NAO chama Meta.
//   - NAO gera link wa.me (diferente do adapter manual).
//   - Retorna provider_message_id deterministico (`stub_<ts>_<rand>`).
//   - Permite simular falha controlada via env
//     WHATSAPP_STUB_FORCE_FAIL=true (para teste de fluxo de erro
//     sem precisar de provider real).
//
// Contrato (compativel com facade legado):
//
//   { provider, status, url, destino, mensagem, erro, messageId? }
//
// Status retornado:
//   - "queued_stub": simulou ok (default).
//   - "error":        WHATSAPP_STUB_FORCE_FAIL=true OU input invalido.
//
// O facade legado (services/whatsapp/index.js) traduz "queued_stub"
// para "manual_pending" para preservar compatibilidade com o
// modulo Pedidos. O whatsappService novo (corretora) consome o
// "queued_stub" diretamente sem traducao.

const crypto = require("node:crypto");
const logger = require("../../../lib/logger");

function genStubId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString("hex");
  return `stub_${ts}_${rand}`;
}

async function send({ destino, mensagem, options = {} } = {}) {
  if (!destino || !mensagem) {
    return {
      provider: "stub",
      status: "error",
      url: null,
      destino: destino || "",
      mensagem: mensagem || "",
      erro: "stub.invalid_input",
    };
  }

  if (process.env.WHATSAPP_STUB_FORCE_FAIL === "true") {
    logger.warn(
      { destino, templateId: options.templateId || null },
      "whatsapp.stub.force_fail",
    );
    return {
      provider: "stub",
      status: "error",
      url: null,
      destino,
      mensagem,
      erro: "stub.force_fail",
    };
  }

  const messageId = genStubId();

  logger.info(
    {
      destino,
      messageId,
      templateId: options.templateId || null,
      len: mensagem.length,
    },
    "whatsapp.stub.simulated",
  );

  return {
    provider: "stub",
    status: "queued_stub",
    url: null,
    destino,
    mensagem,
    erro: null,
    messageId,
  };
}

module.exports = { send };
