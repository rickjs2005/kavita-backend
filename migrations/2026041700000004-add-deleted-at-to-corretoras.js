"use strict";

// Sprint 3 — Soft delete em corretoras.
//
// Até aqui "deletar" significava UPDATE status='inactive'. Soft delete
// real preserva histórico (auditoria, leads, subscriptions) mas tira
// o registro completamente do fluxo público e do admin ativo.
// Regras:
//   - deleted_at IS NULL → registro ativo (listagens normais)
//   - deleted_at IS NOT NULL → arquivado (só visível em rota dedicada)
//
// Mantemos status='inactive' como distinção: "indisponível
// temporariamente" (pausado) vs "arquivado para sempre" (soft delete).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretoras", "deleted_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("corretoras", ["deleted_at"], {
      name: "idx_corretoras_deleted_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("corretoras", "idx_corretoras_deleted_at");
    await queryInterface.removeColumn("corretoras", "deleted_at");
  },
};
