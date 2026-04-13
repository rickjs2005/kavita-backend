"use strict";

module.exports = function ocorrenciaResolvidaWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! Sua solicitação sobre o pedido #${pedido.id} foi analisada e resolvida. Se precisar de algo mais, estamos aqui. Equipe Kavita.`;
};
