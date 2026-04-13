"use strict";
// templates/email/ocorrenciaSolicitarDados.js
// Solicita dados corretos de endereço ao cliente.

module.exports = function ocorrenciaSolicitarDadosEmail(pedido) {
  return {
    subject: `Kavita - Precisamos confirmar o endereço do pedido #${pedido.id}`,
    html: `
      <p>Olá ${pedido.usuario_nome},</p>
      <p>Estamos verificando os dados de entrega do seu pedido <strong>#${pedido.id}</strong> e precisamos da sua ajuda para confirmar o endereço correto.</p>
      <p>Por favor, nos envie as informações atualizadas respondendo a este email ou entrando em contato conosco.</p>
      <p>Precisamos de:</p>
      <ul>
        <li>Rua/Avenida e número</li>
        <li>Complemento (se houver)</li>
        <li>Bairro</li>
        <li>Cidade e Estado</li>
        <li>CEP</li>
        <li>Ponto de referência (se houver)</li>
      </ul>
      <p>Aguardamos seu retorno para dar sequência à entrega.</p>
      <p>Equipe Kavita 🐄🌱</p>
    `,
  };
};
