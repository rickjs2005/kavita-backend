"use strict";
// templates/whatsapp/pedidoEntregue.js
// Mensagem rural/humana de confirmação de entrega.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {string}
 */
module.exports = function pedidoEntregueWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  return [
    `Olá, ${nome}! O pedido #${pedido.id} consta como entregue na sua propriedade.`,
    "Se tiver qualquer problema com o produto recebido, chama a gente.",
    "Obrigado pela confiança, viu?",
  ].join("\n");
};
