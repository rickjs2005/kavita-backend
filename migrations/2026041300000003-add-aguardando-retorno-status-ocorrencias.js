"use strict";

// Adiciona 'aguardando_retorno' ao enum de status de pedido_ocorrencias.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`pedido_ocorrencias\`
       MODIFY COLUMN \`status\`
       enum('aberta','em_analise','aguardando_retorno','resolvida','rejeitada')
       NOT NULL DEFAULT 'aberta'`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`pedido_ocorrencias\`
       MODIFY COLUMN \`status\`
       enum('aberta','em_analise','resolvida','rejeitada')
       NOT NULL DEFAULT 'aberta'`
    );
  },
};
