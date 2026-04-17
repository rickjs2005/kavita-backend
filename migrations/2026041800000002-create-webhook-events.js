"use strict";

// Fase 3 Etapa A — Idempotência de webhooks de gateway de pagamento.
//
// Gateways (Asaas, Pagar.me, Stripe) reenviam eventos quando não
// recebem 200 rapidamente. Sem idempotência, uma mesma confirmação
// de pagamento pode dobrar cobranças ou criar subscriptions
// fantasmas. Esta tabela é append-only com UNIQUE por (provider,
// provider_event_id) — INSERT IGNORE atua como lock natural.
//
// Campos:
//   provider            — "asaas" | "pagarme" | futuro
//   provider_event_id   — id único do gateway (obrigatório no header
//                         ou no payload; depende do provider)
//   event_type          — PAYMENT_CONFIRMED, PAYMENT_OVERDUE, etc.
//                         mantido como string livre para aceitar
//                         expansão de provider sem migration
//   payload             — JSON bruto recebido (auditoria + reprocessar)
//   processed_at        — NULL = pending, datetime = sucesso
//   processing_error    — mensagem se falhou
//   retry_count         — contador de reprocessamento manual
//
// Use cases cobertos:
//   1. Idempotência: INSERT IGNORE ao receber → se affectedRows=0,
//      evento já foi visto; backend responde 200 sem processar.
//   2. Reconciliação diária: SELECT ... WHERE processed_at IS NULL
//      para reprocessar eventos que falharam.
//   3. Auditoria: histórico completo do que o gateway mandou.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("webhook_events", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      provider_event_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      event_type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      processing_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      retry_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Idempotência natural — se chegar o mesmo evento do mesmo
    // provider duas vezes, INSERT IGNORE dropa o segundo.
    await queryInterface.addIndex(
      "webhook_events",
      ["provider", "provider_event_id"],
      { name: "uq_webhook_provider_event", unique: true },
    );

    // Reconciliação diária: cron faz SELECT com esse filtro.
    await queryInterface.addIndex(
      "webhook_events",
      ["processed_at", "provider"],
      { name: "idx_webhook_unprocessed" },
    );

    // Listagem por tipo de evento para análise operacional.
    await queryInterface.addIndex(
      "webhook_events",
      ["event_type", "created_at"],
      { name: "idx_webhook_event_type" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("webhook_events");
  },
};
