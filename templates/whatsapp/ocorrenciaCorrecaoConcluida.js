"use strict";

module.exports = function ocorrenciaCorrecaoConcluidaWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! O endereço de entrega do pedido #${pedido.id} foi corrigido com sucesso. Seu pedido seguirá normalmente. Obrigado por nos informar! Equipe Kavita.`;
};
