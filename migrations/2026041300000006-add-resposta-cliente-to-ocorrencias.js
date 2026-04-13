"use strict";

// Adiciona campo para o cliente responder uma ocorrência
// quando o admin solicita retorno (status aguardando_retorno).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("pedido_ocorrencias", "resposta_cliente", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      after: "observacao",
    });
    await queryInterface.addColumn("pedido_ocorrencias", "endereco_sugerido", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      after: "resposta_cliente",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("pedido_ocorrencias", "endereco_sugerido");
    await queryInterface.removeColumn("pedido_ocorrencias", "resposta_cliente");
  },
};
