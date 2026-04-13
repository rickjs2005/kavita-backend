"use strict";
// templates/email/ocorrenciaTaxaExtra.js
// Informa possibilidade de taxa extra por alteração de endereço.

module.exports = function ocorrenciaTaxaExtraEmail(pedido) {
  return {
    subject: `Kavita - Informação sobre custo de entrega do pedido #${pedido.id}`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>Analisamos a solicitação de alteração de endereço do seu pedido <strong>#${pedido.id}</strong>.</p>
      <p>Informamos que a mudança no endereço de entrega pode gerar um custo logístico adicional. Antes de prosseguir, gostaríamos de confirmar com você.</p>
      <p>Por favor, entre em contato conosco para que possamos alinhar os detalhes e dar sequência ao seu pedido.</p>
      <p>Equipe Kavita 🐄🌱</p>
    `,
  };
};
