"use strict";
// templates/email/pagamentoAprovado.js
// Template de e-mail: confirmação de pagamento aprovado.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildEmailFromTemplate

/**
 * @param {{ id, usuario_nome, total }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function pagamentoAprovadoEmail(pedido) {
  const n = Number(pedido.total ?? 0);
  const total = Number.isNaN(n) ? 0 : n;
  return {
    subject: `Kavita - Pagamento do pedido #${pedido.id} aprovado`,
    html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>O pagamento do seu pedido <strong>#${pedido.id}</strong> foi aprovado 🎉.</p>
          <p>Valor: <strong>R$ ${total.toFixed(2)}</strong></p>
          <p>Agora vamos separar e preparar o envio.</p>
          <p>Equipe Kavita</p>
        `,
  };
};
