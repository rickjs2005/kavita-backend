"use strict";

// Lote 5 — Supressão de emails (CAN-SPAM / LGPD).
//
// Fonte de verdade para "nunca mais envie emails transacionais não essenciais
// para este endereço". Consultada ANTES de qualquer envio de follow-up,
// welcome, digest, etc.
//
// Não afeta emails estritamente transacionais (magic link, confirmação
// de ação iniciada pelo usuário) — estes seguem sendo enviados mesmo
// se o email estiver aqui, pois são requisito operacional.
//
// reason:
//   user_unsubscribe  — produtor clicou em "não quero mais"
//   bounce            — hard bounce detectado pelo provider
//   complaint         — marcou como spam
//   admin             — admin suprimiu manualmente

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_suppressions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      email: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "user_unsubscribe",
      },
      scope: {
        // "marketing" cobre follow-ups, digests, alertas.
        // "all" bloqueia tudo exceto magic link/transacional estrito.
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "marketing",
      },
      note: { type: Sequelize.STRING(255), allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // UNIQUE (email, scope) — um mesmo email pode ter entradas em escopos diferentes.
    await queryInterface.addConstraint("email_suppressions", {
      fields: ["email", "scope"],
      type: "unique",
      name: "uq_email_suppressions_email_scope",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("email_suppressions");
  },
};
