"use strict";

// Estende drones_cases com:
//   - metrics_json: JSON com array de métricas estruturadas
//                   ([{ label, value, hint? }]). Permite exibir "ganho
//                   percentual", "redução de falhas", "área pulverizada"
//                   no card público sem migrar mais 5 colunas — admin
//                   adiciona 0..N por case.
//   - before_label / after_label: legendas storytelling do antes/depois
//                   (ex: "Pulverização irregular em terreno inclinado"
//                    → "Cobertura uniforme com DJI Agras T25P"). Sobre
//                   imagens já existentes (before_image_url / after_*).
//
// Sem mudança em colunas existentes — admin antigo continua funcionando
// (campos novos são nullable). Render público vai esconder seções
// quando faltar dado (degradação elegante).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("drones_cases", "metrics_json", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    await queryInterface.addColumn("drones_cases", "before_label", {
      type: Sequelize.STRING(160),
      allowNull: true,
    });

    await queryInterface.addColumn("drones_cases", "after_label", {
      type: Sequelize.STRING(160),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("drones_cases", "after_label");
    await queryInterface.removeColumn("drones_cases", "before_label");
    await queryInterface.removeColumn("drones_cases", "metrics_json");
  },
};
