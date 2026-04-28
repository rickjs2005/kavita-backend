"use strict";
// templates/whatsapp/pagamentoAprovado.js
// Mensagem rural/humana para confirmação de pagamento aprovado.

/**
 * @param {{ id, usuario_nome, total }} pedido
 * @returns {string}
 */
module.exports = function pagamentoAprovadoWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return [
    `Olá, ${nome}! O pagamento do seu pedido #${pedido.id} foi confirmado.`,
    `Valor: R$ ${total.toFixed(2).replace(".", ",")}.`,
    "Nossa equipe já começou a separar seus produtos.",
    "Avisamos por aqui assim que sair pra entrega.",
  ].join("\n");
};
