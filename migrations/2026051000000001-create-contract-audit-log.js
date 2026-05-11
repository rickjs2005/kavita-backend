"use strict";

// Fase 10.5 — Trilha append-only de eventos do contrato.
//
// Separada de:
//   - corretora_lead_events (timeline operacional do lead — visível à corretora)
//   - webhook_events        (payload bruto do provider — útil pra reconciliação)
//   - logger estruturado    (volátil; depende do agregador)
//
// contract_audit_log é a fonte de verdade jurídica do ciclo de vida do
// contrato. Cada transição importante grava uma linha imutável com
// actor, ip, user_agent, status anterior/novo e payload contextual.
//
// Convenções:
//   - SEM UPDATE, SEM DELETE no aplicativo (repository expõe só
//     createEvent/list). Defesa adicional poderia ser GRANT seletivo
//     no MySQL — fica como próxima etapa.
//   - PK BIGINT UNSIGNED para sobrar espaço (auditoria cresce rápido).
//   - FKs em INTEGER UNSIGNED alinham com contratos.id / corretoras.id /
//     corretora_leads.id (todos INT UNSIGNED na fase 10.x).
//   - actor_id sem FK formal — actor pode ser admin OU corretora_user
//     OU produtor (lead-based) OU NULL (webhook/system); FK polimórfica
//     não compensa, o actor_type esclarece.
//   - SEM ON DELETE CASCADE em contrato_id — auditoria sobrevive ao
//     soft delete do contrato (se vier no futuro).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contract_audit_log", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      contrato_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "contratos", key: "id" },
        onDelete: "RESTRICT",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      event_type: {
        type: Sequelize.ENUM(
          "created",
          "sent_to_signature",
          "signed",
          "cancelled",
          "expired",
          "blocked_by_plan",
          "blocked_by_kyc",
          "downloaded",
          "webhook_applied",
          "webhook_blocked",
          "immutable_blocked",
        ),
        allowNull: false,
      },
      actor_type: {
        type: Sequelize.ENUM(
          "admin",
          "corretora_user",
          "producer",
          "system",
          "webhook",
        ),
        allowNull: false,
      },
      actor_id: {
        type: Sequelize.INTEGER.UNSIGNED,
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
      previous_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      new_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      provider_document_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Payload contextual: motivo do cancelamento, hash gerado,
      // numero_externo, capability ausente, subscription_status,
      // signed_pdf_url, etc. Mantido livre para o caller decidir o que
      // serializar — facilita evolução sem migration.
      payload: {
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
      "contract_audit_log",
      ["contrato_id", "created_at"],
      { name: "idx_cal_contrato_created" },
    );
    await queryInterface.addIndex(
      "contract_audit_log",
      ["corretora_id", "created_at"],
      { name: "idx_cal_corretora_created" },
    );
    await queryInterface.addIndex(
      "contract_audit_log",
      ["lead_id", "created_at"],
      { name: "idx_cal_lead_created" },
    );
    await queryInterface.addIndex(
      "contract_audit_log",
      ["event_type", "created_at"],
      { name: "idx_cal_event_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contract_audit_log");
  },
};
