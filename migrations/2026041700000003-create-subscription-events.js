"use strict";

// Sprint 3 — Trilha de eventos de assinatura.
//
// corretora_subscriptions hoje é um registro que é sobrescrito: mudar
// plano vira UPDATE, expirar trial vira UPDATE de status, cancelar vira
// UPDATE com canceled_at. Sem histórico de eventos, auditoria financeira
// e análise de churn ficam inviáveis.
//
// Este log é append-only: cada mudança relevante grava uma linha. O
// snapshot de capabilities fica no meta para sobreviver a edições
// posteriores no catálogo de planos (versionamento leve).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("subscription_events", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      subscription_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_subscriptions", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      // Tipos conhecidos: assigned, upgraded, downgraded, renewed,
      // expired, canceled, payment_succeeded, payment_failed,
      // status_changed. Mantido como VARCHAR para aceitar expansão
      // sem migration.
      event_type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      from_plan_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      to_plan_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      from_status: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      to_status: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      // Snapshot do plano atribuído (name, slug, capabilities,
      // price_cents, billing_cycle). Preserva contrato no momento do
      // evento mesmo que o catálogo mude depois.
      plan_snapshot: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      // Metadata livre: trial_ends_at, reason, provider_event_id etc.
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      // Quem disparou o evento. actor_type: admin, corretora_user,
      // system (cron/middleware), provider (webhook futuro).
      actor_type: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      actor_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "subscription_events",
      ["corretora_id", "created_at"],
      { name: "idx_sub_events_corretora" },
    );
    await queryInterface.addIndex(
      "subscription_events",
      ["subscription_id"],
      { name: "idx_sub_events_subscription" },
    );
    await queryInterface.addIndex(
      "subscription_events",
      ["event_type", "created_at"],
      { name: "idx_sub_events_type" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("subscription_events");
  },
};
