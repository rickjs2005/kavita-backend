"use strict";

// Fase 2 do Mercado do Café — conta própria da corretora + leads.
//
// corretora_users  → usuários que fazem login no /painel/corretora
// corretora_leads  → contatos capturados na página pública da corretora

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── corretora_users ───────────────────────────────────────────────
    await queryInterface.createTable("corretora_users", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      nome: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      token_version: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
    });

    await queryInterface.addIndex("corretora_users", ["email"], {
      name: "uq_corretora_users_email",
      unique: true,
    });
    await queryInterface.addIndex("corretora_users", ["corretora_id"], {
      name: "idx_corretora_users_corretora",
    });

    // ─── corretora_leads ───────────────────────────────────────────────
    await queryInterface.createTable("corretora_leads", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      nome: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      telefone: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      cidade: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      mensagem: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("new", "contacted", "closed", "lost"),
        allowNull: false,
        defaultValue: "new",
      },
      nota_interna: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      source_ip: {
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
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
    });

    await queryInterface.addIndex("corretora_leads", ["corretora_id", "status"], {
      name: "idx_corretora_leads_corretora_status",
    });
    await queryInterface.addIndex("corretora_leads", ["created_at"], {
      name: "idx_corretora_leads_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_leads");
    await queryInterface.dropTable("corretora_users");
  },
};
