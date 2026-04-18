"use strict";

// ETAPA 2.1 — 2FA TOTP + últimos sinais de sessão em corretora_users.
//
// DEFENSIVA: alguns campos já existem em corretora_users desde a
// migration 2026041000000001 (ex.: last_login_at). Este up() faz
// describeTable antes de cada addColumn — re-executar após falha
// parcial não duplica coluna existente. A tabela de backup codes
// também é criada só se ainda não existir.
//
// Estratégia:
//   - totp_secret: base32 guardado em plaintext (reconhecido — migrar
//     pra vault cifrado é trocar a coluna sem perder usuários)
//   - totp_enabled: só vira 1 após confirmação do primeiro código
//   - last_login_ip: novo; last_login_at JÁ EXISTE, skipamos

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (desc[column]) return false;
  await queryInterface.addColumn(table, column, spec);
  return true;
}

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  // Alguns drivers retornam string[], outros objetos { tableName }
  return tables.some((t) =>
    typeof t === "string" ? t === tableName : t?.tableName === tableName,
  );
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, "corretora_users", "totp_secret", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, "corretora_users", "totp_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await addColumnIfMissing(
      queryInterface,
      "corretora_users",
      "totp_enabled_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );
    await addColumnIfMissing(
      queryInterface,
      "corretora_users",
      "last_login_ip",
      {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
    );
    // `last_login_at` já existe desde 2026041000000001 — skipado
    // implicitamente pelo addColumnIfMissing.
    await addColumnIfMissing(
      queryInterface,
      "corretora_users",
      "last_login_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );

    if (!(await tableExists(queryInterface, "corretora_user_backup_codes"))) {
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
    }
  },

  async down(queryInterface) {
    // down também defensivo — pode ser chamado após up parcial
    const desc = await queryInterface
      .describeTable("corretora_users")
      .catch(() => ({}));
    if (await tableExists(queryInterface, "corretora_user_backup_codes")) {
      await queryInterface.dropTable("corretora_user_backup_codes");
    }
    // Não removemos last_login_at (foi criada por outra migration);
    // só removemos os campos que ESTA migration introduziu.
    if (desc.last_login_ip) {
      await queryInterface.removeColumn("corretora_users", "last_login_ip");
    }
    if (desc.totp_enabled_at) {
      await queryInterface.removeColumn("corretora_users", "totp_enabled_at");
    }
    if (desc.totp_enabled) {
      await queryInterface.removeColumn("corretora_users", "totp_enabled");
    }
    if (desc.totp_secret) {
      await queryInterface.removeColumn("corretora_users", "totp_secret");
    }
  },
};
