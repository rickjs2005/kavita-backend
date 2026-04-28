"use strict";
// templates/whatsapp/pedidoEmSeparacao.js
// Mensagem rural/humana para pedido entrando em separação.
// Disparado quando admin marca status_entrega = "em_separacao".

/**
 * @param {{ id, usuario_nome }} pedido
 * @returns {string}
 */
module.exports = function pedidoEmSeparacaoWhatsapp(pedido) {
  const nome = (pedido.usuario_nome || "").split(" ")[0] || "amigo(a)";
  return [
    `Olá, ${nome}! Seu pedido #${pedido.id} já está sendo separado pela nossa equipe.`,
    "Assim que estiver pronto pra sair, te avisamos por aqui.",
  ].join("\n");
};
