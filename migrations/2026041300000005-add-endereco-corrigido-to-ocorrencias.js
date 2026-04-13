"use strict";

// Adiciona campo para armazenar o endereço corrigido pelo admin,
// permitindo rastreabilidade do antes vs depois.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("pedido_ocorrencias", "endereco_corrigido", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      after: "resposta_admin",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("pedido_ocorrencias", "endereco_corrigido");
  },
};
