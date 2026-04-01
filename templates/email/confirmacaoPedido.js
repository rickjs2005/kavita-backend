"use strict";
// templates/email/confirmacaoPedido.js
// Template de e-mail: confirmação de pedido recebido.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildEmailFromTemplate

/**
 * @param {{ id, usuario_nome, total, forma_pagamento }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function confirmacaoPedidoEmail(pedido) {
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return {
    subject: `Kavita - Pedido #${pedido.id} recebido`,
    html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>Recebemos o seu pedido <strong>#${pedido.id}</strong> no valor de <strong>R$ ${total.toFixed(
            2
          )}</strong>.</p>
          <p>Forma de pagamento: <strong>${pedido.forma_pagamento}</strong></p>
          <p>Você receberá novas atualizações assim que o pedido avançar.</p>
          <p>Equipe Kavita 🐄🌱</p>
        `,
  };
};
