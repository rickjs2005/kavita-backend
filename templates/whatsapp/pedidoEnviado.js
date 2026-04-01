"use strict";
// templates/whatsapp/pedidoEnviado.js
// Template de WhatsApp: pedido enviado para entrega.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildWhatsappFromTemplate

/**
 * @param {{ id, usuario_nome, status_entrega }} pedido
 * @returns {string}
 */
module.exports = function pedidoEnviadoWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! Seu pedido #${pedido.id} foi enviado 🚚. Status de entrega: ${pedido.status_entrega}.`;
};
