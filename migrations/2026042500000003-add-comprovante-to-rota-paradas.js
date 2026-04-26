"use strict";
// Fase 5 — comprovante de entrega.
//
// 2 colunas em rota_paradas:
//   - comprovante_foto_url: paths persistidos via mediaService (folder='entregas')
//   - assinatura_url: PNG base64 da assinatura (canvas), persistido como
//     image/png via mesmo storageAdapter
//
// Ambas opcionais — motorista que esquece nao trava entrega.
// Backend nao exige; e' UX/auditoria.

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, spec);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, "rota_paradas", "comprovante_foto_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
    await addColumnIfMissing(queryInterface, "rota_paradas", "assinatura_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    // Down deliberadamente parcial — preserva dados.
  },
};
