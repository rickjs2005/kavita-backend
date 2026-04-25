"use strict";
// services/whatsapp/adapters/api.js
//
// Adapter "api" — placeholder para integração oficial com a
// WhatsApp Business Cloud API (Meta) ou provedor BSP equivalente
// (Twilio, Z-API, 360dialog, Gupshup).
//
// Hoje retorna status="error" — o sistema cai no modo manual
// enquanto não há credencial homologada. Quando for implementar:
//
//   1. Aprovar template "transactional" na Meta Business Manager.
//   2. Adicionar env vars: WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
//   3. Substituir o stub abaixo pela chamada real:
//        POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
//        body: { messaging_product: "whatsapp", to: destino, type: "text",
//                text: { body: mensagem } }
//   4. Retornar status="sent" em sucesso ou "error" + erro detalhado.
//
// Atenção: WhatsApp Business só permite enviar mensagem livre dentro
// da janela de 24h após o cliente ter respondido. Fora disso só
// templates aprovados. Por isso a Etapa 1 do roadmap mantém o modo
// manual como padrão — não exige aprovação prévia da Meta.

const logger = require("../../../lib/logger");

async function send({ destino, mensagem }) {
  logger.warn(
    { destino, len: mensagem.length },
    "whatsapp.api.not_implemented — usando modo manual como fallback",
  );
  return {
    provider: "api",
    status: "error",
    url: null,
    destino,
    mensagem,
    erro: "WhatsApp Business API ainda não configurada. Use WHATSAPP_PROVIDER=manual.",
  };
}

module.exports = { send };
