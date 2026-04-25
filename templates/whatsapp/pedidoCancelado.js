"use strict";
// templates/whatsapp/pedidoCancelado.js
// Mensagem rural/humana de aviso de cancelamento de pedido.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {string}
 */
module.exports = function pedidoCanceladoWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  return [
    `Olá, ${nome}. Seu pedido #${pedido.id} foi cancelado.`,
    `Se houve algum problema ou se quiser fazer um novo pedido, é só falar com a gente.`,
    `Estamos por aqui pra ajudar.`,
  ].join("\n");
};
