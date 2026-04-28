"use strict";
// templates/whatsapp/pedidoEnviado.js
// Mensagem rural/humana para pedido despachado para entrega.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {string}
 */
module.exports = function pedidoEnviadoWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  return [
    `Olá, ${nome}! Seu pedido #${pedido.id} acabou de sair pra entrega.`,
    "Em breve chega na sua propriedade.",
    "Quando receber, qualquer coisa fora do esperado, fale com a gente.",
  ].join("\n");
};
