"use strict";
// services/whatsapp/adapters/manual.js
//
// Adapter "manual" — não envia mensagem real. Apenas gera o link
// wa.me e devolve pra quem chamou. O painel admin renderiza o link
// e o operador clica e envia pelo próprio WhatsApp Web/Mobile.
//
// É o modo padrão e funciona sem dependência de API externa nem
// credencial. Ideal pra rodar enquanto a integração oficial com
// WhatsApp Business Cloud não está homologada/aprovada pela Meta.
//
// Status do envio:
//   "manual_pending" — link foi gerado e está disponível pro admin.
//                      Não conta como "entregue" — o sistema não tem
//                      como saber se o admin de fato clicou e enviou.

const { buildWaMeLink } = require("../../../lib/waLink");
const logger = require("../../../lib/logger");

async function send({ destino, mensagem }) {
  const url = buildWaMeLink({ telefone: destino, mensagem });

  if (!url) {
    return {
      provider: "manual",
      status: "error",
      url: null,
      destino,
      mensagem,
      erro: "Não foi possível gerar link wa.me (telefone ou mensagem inválidos).",
    };
  }

  // Log para o operador rastrear depois no admin se quiser.
  logger.info(
    { destino, len: mensagem.length },
    "whatsapp.manual.link_generated",
  );

  return {
    provider: "manual",
    status: "manual_pending",
    url,
    destino,
    mensagem,
    erro: null,
  };
}

module.exports = { send };
