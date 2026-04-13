"use strict";

module.exports = function ocorrenciaSolicitarDadosWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! Sobre o pedido #${pedido.id}, precisamos confirmar o endereço correto de entrega. Pode nos enviar os dados atualizados (rua, número, bairro, cidade, estado, CEP)? Equipe Kavita.`;
};
