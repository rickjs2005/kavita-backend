"use strict";

// Lote 5 — Follow-up automatizado de leads (7d pós-lead).
//
// Uma linha por (lead_id) — UNIQUE garante idempotência:
// mesmo que o cron rode 10x no mesmo dia, cada lead é processado uma vez.
//
// Estados:
//   sent_at          — email disparado (fire-and-forget bem-sucedido)
//   clicked_at       — (opcional futuro) produtor clicou no CTA de review
//   error_at/error   — último erro (para retry manual ou inspeção)
//
// Tipo sempre "review_request_7d" no MVP, mas a coluna é VARCHAR para
// abrir caminho a cadências futuras (day_30, reengagement, etc).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_lead_followups", {
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
      kind: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "review_request_7d",
      },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      clicked_at: { type: Sequelize.DATE, allowNull: true },
      error_at: { type: Sequelize.DATE, allowNull: true },
      error_message: { type: Sequelize.STRING(500), allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // UNIQUE (lead_id, kind) — idempotência por tipo de cadência.
    await queryInterface.addConstraint("corretora_lead_followups", {
      fields: ["lead_id", "kind"],
      type: "unique",
      name: "uq_lead_followups_lead_kind",
    });

    // Dashboard/telemetria: quantos follow-ups por dia.
    await queryInterface.addIndex(
      "corretora_lead_followups",
      ["kind", "sent_at"],
      { name: "idx_followups_kind_sent" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_lead_followups");
  },
};
