"use strict";

// Lote 3 — Governança operacional.
//
// Audit log dedicado a ações do admin no módulo Mercado do Café.
// Diferente de corretora_audit (que é do ecossistema de produtos),
// este é focado em compliance e rastreabilidade regional:
//
//   - Quem aprovou/rejeitou qual corretora e quando
//   - Mudanças de status e destaque
//   - Moderação de reviews
//   - Atribuição de planos
//   - Desativação de corretoras
//
// Design:
//   - target_type + target_id — registro afetado (generic)
//   - action — tipo de evento (extensível VARCHAR)
//   - meta JSON — payload livre (antes/depois, reason, etc)
//   - actor (admin_id + nome snapshot) — preserva mesmo se o admin
//     for removido depois
//
// Não reusa product_events (analytics) porque:
//   - admin_audit_logs tem requisito de retenção diferente (nunca deletar)
//   - queries são diferentes (filtro por target_type/id, não por funnel)
//   - compliance/LGPD pode exigir export/purge seletivo

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("admin_audit_logs", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      admin_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true, // admin pode ter sido deletado depois
      },
      admin_nome: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      action: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      target_type: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      target_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      meta: {
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
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "admin_audit_logs",
      ["target_type", "target_id", "created_at"],
      { name: "idx_audit_target" },
    );
    await queryInterface.addIndex("admin_audit_logs", ["admin_id", "created_at"], {
      name: "idx_audit_admin",
    });
    await queryInterface.addIndex("admin_audit_logs", ["action", "created_at"], {
      name: "idx_audit_action",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("admin_audit_logs");
  },
};
