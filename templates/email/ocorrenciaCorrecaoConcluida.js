"use strict";
// templates/email/ocorrenciaCorrecaoConcluida.js
// Confirma que a correção de endereço foi aplicada.

module.exports = function ocorrenciaCorrecaoConcluidaEmail(pedido) {
  return {
    subject: `Kavita - Endereço do pedido #${pedido.id} atualizado`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>Confirmamos que o endereço de entrega do seu pedido <strong>#${pedido.id}</strong> foi corrigido com sucesso.</p>
      <p>Seu pedido seguirá o fluxo normal de entrega com os dados atualizados.</p>
      <p>Obrigado por nos informar! Se tiver qualquer outra dúvida, estamos à disposição.</p>
      <p>Equipe Kavita 🐄🌱</p>
    `,
  };
};
