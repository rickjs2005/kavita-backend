"use strict";

// Seções editáveis da landing /drones.
//
// Hoje as seções "Por que usar drones" (why), "Para quem é" (who),
// "Como funciona" (how) e "Por que escolher a Kavita" (trust) são
// hardcoded em 4 componentes React. Toda revisão de copy depende de
// deploy.
//
// Esta tabela passa a ser fonte da verdade. Cada seção é uma row
// identificada por uma `key` única (why/who/how/trust). Os `items`
// ficam num JSON livre — cada seção decide o shape (ícone, título,
// texto, badge opcional). Frontend mapeia key-de-ícone → componente
// Lucide e cai em fallback estático se a API falhar.
//
// Modelo único (em vez de uma tabela por seção) porque:
//   - todas as 4 seções têm o mesmo formato base (título + subtítulo
//     + lista de itens), só os itens variam levemente.
//   - admin único de "editar uma seção da landing" é UI mais simples.
//   - novas seções entram só com seed de uma key nova, sem migration.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("drones_landing_sections", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      // Identificador estável (why/who/how/trust). Nunca muda — é o
      // que o frontend usa para localizar a seção certa.
      section_key: {
        type: Sequelize.STRING(40),
        allowNull: false,
        unique: true,
      },
      title: {
        type: Sequelize.STRING(160),
        allowNull: true,
      },
      subtitle: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      // Lista de cards/itens. Shape sugerido por seção:
      //   why:   [{ icon, title, text }]
      //   who:   [{ icon, title, text, badge }]
      //   how:   [{ icon, title, text }]   (numeração 01/02/... vem do índice)
      //   trust: [{ title, text }]
      items_json: {
        type: Sequelize.JSON,
        allowNull: true,
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

    // section_key UNIQUE explícito (Sequelize cria índice via unique:true,
    // mas garantimos nome previsível).
    await queryInterface.sequelize.query(
      "CREATE UNIQUE INDEX uq_drones_landing_sections_key ON drones_landing_sections(section_key)",
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("drones_landing_sections");
  },
};
