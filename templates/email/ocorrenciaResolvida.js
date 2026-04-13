"use strict";
// templates/email/ocorrenciaResolvida.js
// Notifica que a ocorrência de endereço foi resolvida.

module.exports = function ocorrenciaResolvidaEmail(pedido) {
  return {
    subject: `Kavita - Solicitação sobre o pedido #${pedido.id} resolvida`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>Sua solicitação referente ao pedido <strong>#${pedido.id}</strong> foi analisada e resolvida pela nossa equipe.</p>
      <p>Se precisar de mais alguma coisa, estamos à disposição.</p>
      <p>Equipe Kavita 🐄🌱</p>
    `,
  };
};
