"use strict";
// templates/email/pedidoCancelado.js
// Template de e-mail: pedido cancelado.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function pedidoCanceladoEmail(pedido) {
  return {
    subject: `Kavita — Pedido #${pedido.id} cancelado`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>O seu pedido <strong>#${pedido.id}</strong> foi cancelado.</p>
      <p>Se houve algum problema ou se quiser fazer um novo pedido, é só falar com a gente.</p>
      <p>Estamos por aqui pra ajudar.</p>
      <p>Equipe Kavita</p>
    `,
  };
};
