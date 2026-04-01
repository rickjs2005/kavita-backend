"use strict";
// templates/whatsapp/confirmacaoPedido.js
// Template de WhatsApp: confirmação de pedido recebido.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildWhatsappFromTemplate

/**
 * @param {{ id, usuario_nome, total }} pedido
 * @returns {string}
 */
module.exports = function confirmacaoPedidoWhatsapp(pedido) {
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return `Olá ${
    pedido.usuario_nome
  }! Recebemos o seu pedido #${pedido.id} no valor de R$ ${total.toFixed(
    2
  )}. Assim que avançar, te avisamos aqui. Equipe Kavita.`;
};
