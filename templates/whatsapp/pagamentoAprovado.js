"use strict";
// templates/whatsapp/pagamentoAprovado.js
// Template de WhatsApp: confirmação de pagamento aprovado.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildWhatsappFromTemplate

/**
 * @param {{ id, usuario_nome, total }} pedido
 * @returns {string}
 */
module.exports = function pagamentoAprovadoWhatsapp(pedido) {
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return `Olá ${
    pedido.usuario_nome
  }! O pagamento do seu pedido #${pedido.id} foi aprovado 🎉. Valor: R$ ${total.toFixed(
    2
  )}. Vamos separar e já avisamos quando sair para entrega.`;
};
