"use strict";

// Adiciona admin_id para rastrear qual admin tratou a ocorrência.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("pedido_ocorrencias", "admin_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      after: "taxa_extra",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("pedido_ocorrencias", "admin_id");
  },
};
