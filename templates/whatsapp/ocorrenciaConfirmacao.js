"use strict";

module.exports = function ocorrenciaConfirmacaoWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! Recebemos sua solicitação sobre o endereço de entrega do pedido #${pedido.id}. Nosso time está analisando e em breve retornamos. Equipe Kavita.`;
};
