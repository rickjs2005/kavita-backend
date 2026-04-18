"use strict";

// Fase 3 — timeline de eventos do lead. Cada ação importante gera
// uma linha aqui e aparece ordenada no detalhe do lead.
//
// event_type é VARCHAR (não enum) pra não exigir migration toda vez
// que aparece tipo novo. Catálogo atual vive no service:
//   - lead_created
//   - status_changed
//   - note_added
//   - whatsapp_opened
//   - sample_requested / sample_received
//   - analysis_updated
//   - proposal_sent
//   - deal_won / deal_lost
//   - lote_confirmed_sold
//
// meta é JSON opcional com detalhes específicos (from/to status,
// preço proposto, etc.). actor_user_id NULL quando é evento de
// sistema (lead_created via form público, lote_confirmed_sold via
// link HMAC do produtor).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_lead_events", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_leads", key: "id" },
        onDelete: "CASCADE",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onDelete: "CASCADE",
      },
      actor_user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_users", key: "id" },
        onDelete: "SET NULL",
      },
      actor_type: {
        // corretora_user (painel), system (automation), producer (link HMAC)
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "corretora_user",
      },
      event_type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      title: {
        // Resumo curto pra UI ("Status: contato_realizado → amostra_recebida")
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "corretora_lead_events",
      ["lead_id", "created_at"],
      { name: "idx_lead_events_lead_created" },
    );
    await queryInterface.addIndex(
      "corretora_lead_events",
      ["corretora_id", "event_type", "created_at"],
      { name: "idx_lead_events_corretora_type_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_lead_events");
  },
};
