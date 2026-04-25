"use strict";
// templates/email/pedidoEmSeparacao.js
// Template de e-mail: pedido entrou em separação na loja.

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function pedidoEmSeparacaoEmail(pedido) {
  return {
    subject: `Kavita — Seu pedido #${pedido.id} está sendo separado`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>O seu pedido <strong>#${pedido.id}</strong> já está sendo separado pela nossa equipe.</p>
      <p>Assim que estiver pronto pra sair, te avisamos por aqui.</p>
      <p>Equipe Kavita</p>
    `,
  };
};
