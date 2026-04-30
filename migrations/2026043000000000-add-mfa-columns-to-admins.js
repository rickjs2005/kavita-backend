"use strict";

// F1 — adiciona colunas mfa_secret + mfa_active à tabela `admins`.
//
// Histórico: as colunas existiam em DBs legados (ambiente local clonado
// de produção antiga) mas nunca foram adicionadas via migration. Em
// CI/produção fresh, tabela admins nasce sem MFA. Esta migration
// fecha o gap.
//
// Ordem: timestamp 2026043000000000 — vem ANTES de
//   2026043000000001-create-admin-backup-codes (F1)
//   2026043000000002-encrypt-existing-mfa-secrets (F1.6)
// para que a F1.6 encontre a coluna ao rodar.
//
// Idempotente: addColumn só se a coluna não existir.

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (desc[column]) return false;
  await queryInterface.addColumn(table, column, spec);
  return true;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, "admins", "mfa_secret", {
      type: Sequelize.STRING(255), // suficiente para v1:<iv>:<tag>:<ct> de uma base32 de 20 bytes
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, "admins", "mfa_active", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable("admins").catch(() => ({}));
    if (desc.mfa_active) {
      await queryInterface.removeColumn("admins", "mfa_active");
    }
    if (desc.mfa_secret) {
      await queryInterface.removeColumn("admins", "mfa_secret");
    }
  },
};
