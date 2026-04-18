"use strict";

// ETAPA 2.1 — 2FA TOTP (Google Authenticator / Authy / 1Password).
//
// Estratégia:
//   - totp_secret: base32 guardado cifrado? NÃO nesta migration (sem
//     KMS). Armazenado em plaintext mesmo — reconhecemos o trade-off
//     porque exposição requer acesso ao DB. Se um dia houver vault,
//     migrar sem perder usuários (campo reusado).
//   - totp_enabled: só vira true DEPOIS que o usuário confirmou o
//     primeiro código OTP. Setup sem confirmar = não habilitado.
//   - totp_verified_at: quando o usuário provou ter o token no
//     último desafio. JWT checa se < 24h pra evitar re-digitar a
//     cada request.
//
// Backup codes em tabela separada — 10 códigos de 8 chars, 1 uso
// cada. Quando o usuário perde o celular, usa um backup pra entrar
// + regenerar.
//
// Novo IP também: last_login_ip + last_login_at para alerta.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_users", "totp_secret", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_users", "totp_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretora_users", "totp_enabled_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_users", "last_login_ip", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_users", "last_login_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.createTable("corretora_user_backup_codes", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_users", key: "id" },
        onDelete: "CASCADE",
      },
      code_hash: {
        // bcrypt do código — nunca guardamos plaintext depois que
        // o usuário fecha o modal de setup.
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
      "corretora_user_backup_codes",
      ["user_id", "used_at"],
      { name: "idx_corretora_backup_codes_user_used" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_user_backup_codes");
    await queryInterface.removeColumn("corretora_users", "totp_secret");
    await queryInterface.removeColumn("corretora_users", "totp_enabled");
    await queryInterface.removeColumn("corretora_users", "totp_enabled_at");
    await queryInterface.removeColumn("corretora_users", "last_login_ip");
    await queryInterface.removeColumn("corretora_users", "last_login_at");
  },
};
