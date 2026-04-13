"use strict";

module.exports = function ocorrenciaTaxaExtraWhatsapp(pedido) {
  return `Olá ${pedido.usuario_nome}! Analisamos a alteração de endereço do pedido #${pedido.id}. A mudança pode gerar um custo logístico adicional. Podemos conversar sobre os detalhes? Equipe Kavita.`;
};
