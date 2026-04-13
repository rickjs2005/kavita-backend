"use strict";
// templates/email/ocorrenciaConfirmacao.js
// Confirma recebimento de solicitação de correção de endereço.

module.exports = function ocorrenciaConfirmacaoEmail(pedido) {
  return {
    subject: `Kavita - Recebemos sua solicitação sobre o pedido #${pedido.id}`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>Recebemos a sua solicitação de correção de dados de entrega do pedido <strong>#${pedido.id}</strong>.</p>
      <p>Nosso time está analisando e, em breve, entraremos em contato para confirmar as informações.</p>
      <p>Caso a alteração gere algum custo logístico adicional, você será informado antes de qualquer cobrança.</p>
      <p>Equipe Kavita 🐄🌱</p>
    `,
  };
};
