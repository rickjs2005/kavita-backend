"use strict";
// templates/email/pedidoEntregue.js
// Template de e-mail: pedido entregue.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function pedidoEntregueEmail(pedido) {
  return {
    subject: `Kavita — Pedido #${pedido.id} entregue`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>O pedido <strong>#${pedido.id}</strong> consta como entregue.</p>
      <p>Se tiver qualquer problema com o produto recebido, é só chamar a gente.</p>
      <p>Obrigado pela confiança!</p>
      <p>Equipe Kavita</p>
    `,
  };
};
