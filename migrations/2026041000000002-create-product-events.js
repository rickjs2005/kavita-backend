"use strict";

// product_events
//
// Tabela única de eventos de produto. Começa cobrindo a Fase 2 do
// Mercado do Café (corretora_login, lead_created, lead_status_updated,
// profile_updated) mas é agnóstica de domínio — qualquer módulo pode
// emitir eventos aqui via analyticsService.track().
//
// Quando migrar para PostHog/Mixpanel, a tabela continua útil como
// backup local e para relatórios SQL ad-hoc. O formato já espelha o
// contrato esperado por esses provedores.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("product_events", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      event: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      actor_type: {
        type: Sequelize.ENUM(
          "corretora_user",
          "anonymous",
          "admin",
          "system"
        ),
        allowNull: false,
      },
      actor_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      props: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      ip: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("product_events", ["event", "created_at"], {
      name: "idx_product_events_event_created",
    });
    await queryInterface.addIndex(
      "product_events",
      ["corretora_id", "created_at"],
      { name: "idx_product_events_corretora_created" }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("product_events");
  },
};
