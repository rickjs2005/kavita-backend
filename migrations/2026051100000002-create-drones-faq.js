"use strict";

// FAQ editável do módulo Kavita Drones.
//
// Hoje a FAQ pública (DronesFAQ.tsx) é hardcoded no frontend, com
// 8 perguntas/respostas estáticas. Toda revisão de copy depende de
// deploy. Em particular, perguntas sobre regulamentação (ANAC/MAPA/
// CA-CMV) precisam ser revisadas por RT agrônomo e atualizadas sem
// rebuild.
//
// Esta tabela passa a ser fonte da verdade. Frontend lê via endpoint
// público (apenas is_active=1) e cai em fallback estático se a API
// falhar — mantém a landing funcional mesmo offline.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("drones_faq", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      question: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      answer: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    // Índice principal: público filtra por is_active=1 e ordena por
    // sort_order. Admin filtra por is_active também.
    await queryInterface.addIndex(
      "drones_faq",
      ["is_active", "sort_order"],
      { name: "idx_drones_faq_active_order" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("drones_faq");
  },
};
