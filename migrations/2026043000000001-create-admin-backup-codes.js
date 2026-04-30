"use strict";

// Phase 2 go-live — F1 (2FA admin completion).
//
// A tabela `admins` JÁ tem `mfa_secret` (varchar 255) e `mfa_active`
// (tinyint default 0) desde uma migration anterior, e o controller
// `controllers/admin/authAdminController.js#loginMfa` já valida o
// código. O que faltava era backup codes — sem eles, admin que
// perdesse o celular ficaria preso fora do painel até intervenção
// manual no banco.
//
// Esta migration cria APENAS a tabela `admin_backup_codes`. Não
// renomeamos `mfa_secret`/`mfa_active` para `totp_secret`/`totp_enabled`
// neste passo — manter os nomes existentes evita quebrar o controller
// já em produção. O alinhamento de nomenclatura fica para uma migração
// posterior se necessário.
//
// Defensiva: re-execução é segura (CREATE TABLE IF NOT EXISTS).

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((t) =>
    typeof t === "string" ? t === tableName : t?.tableName === tableName,
  );
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "admin_backup_codes")) return;

    await queryInterface.createTable("admin_backup_codes", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      admin_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "admins", key: "id" },
        onDelete: "CASCADE",
      },
      code_hash: {
        // bcrypt(plaintext) — admin vê o código UMA VEZ na tela de
        // setup; depois disso só fica o hash.
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "admin_backup_codes",
      ["admin_id", "used_at"],
      { name: "idx_admin_backup_codes_admin_used" },
    );
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "admin_backup_codes")) {
      await queryInterface.dropTable("admin_backup_codes");
    }
  },
};
