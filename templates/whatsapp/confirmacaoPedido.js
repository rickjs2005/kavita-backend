"use strict";
// templates/whatsapp/confirmacaoPedido.js
// Mensagem rural/humana para confirmação de pedido recebido.
// Tom: primeira pessoa do plural, simples, sem emoji excessivo,
// adequado pro público rural que usa WhatsApp como canal principal.

/**
 * @param {{ id, usuario_nome, total }} pedido
 * @returns {string}
 */
module.exports = function confirmacaoPedidoWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return [
    `Olá, ${nome}! Recebemos seu pedido #${pedido.id} aqui na Kavita.`,
    `Valor total: R$ ${total.toFixed(2).replace(".", ",")}.`,
    `Assim que o pagamento for confirmado, começamos a separar.`,
    `Qualquer dúvida, estamos por aqui.`,
  ].join("\n");
};
