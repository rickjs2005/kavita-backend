"use strict";

// Sprint 6A — Multi-usuário por corretora.
//
// Adiciona role em corretora_users para permitir equipe (owner +
// managers + sales + viewers). Semântica:
//
//   owner    → dono(a) da corretora. Gerencia equipe, edita perfil,
//              gerencia leads. Sempre existe pelo menos 1 owner por
//              corretora (garantido no service ao remover/rebaixar).
//   manager  → gerente. Edita perfil e leads. Não gerencia equipe.
//   sales    → comercial. Vê e atende leads. Não edita perfil.
//   viewer   → apenas leitura. Vê dashboard, leads (sem editar) e
//              perfil. Útil para stakeholders (financeiro, contador).
//
// Migração é backfill-safe: usuários pré-existentes viram owner
// (assumem o papel de dono).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_users", "role", {
      type: Sequelize.ENUM("owner", "manager", "sales", "viewer"),
      allowNull: false,
      defaultValue: "owner",
    });

    // Backfill: primeiro user criado de cada corretora vira owner
    // (idempotente — qualquer user também vira owner por causa do
    // defaultValue, mas rodamos explicitamente para clareza).
    await queryInterface.sequelize.query(
      `UPDATE corretora_users SET role = 'owner' WHERE role IS NULL`,
    );

    await queryInterface.addIndex("corretora_users", ["corretora_id", "role"], {
      name: "idx_corretora_users_role",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "corretora_users",
      "idx_corretora_users_role",
    );
    await queryInterface.removeColumn("corretora_users", "role");
  },
};
