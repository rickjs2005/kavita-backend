"use strict";

// Lote 1 — Retenção do produtor.
//
// Produtor rural (público-alvo principal) passa de "one-shot" para
// usuário recorrente: login via magic link (sem senha — fricção
// mínima), favoritos de corretora, histórico de leads, estrutura
// base para alertas futuros.
//
// Decisões de design:
//
//   - Sem senha. Magic link vai ao email; cookie HttpOnly após clicar.
//     Reusa passwordResetTokenService com scope "producer_magic".
//
//   - telefone_normalizado é a chave de vinculação com leads
//     históricos (mesmo pattern da Sprint 7 / broadcast de lote).
//     Produtor que JÁ enviou leads no passado e depois cria conta
//     com o mesmo telefone vê histórico automaticamente.
//
//   - producer_alert_subscriptions fica como "esqueleto pronto" —
//     tabela criada mas sem worker rodando ainda. Próxima sprint
//     liga o job de envio.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── producer_accounts ─────────────────────────────────────────
    await queryInterface.createTable("producer_accounts", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      cidade: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      telefone: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      // Chave de vinculação com leads históricos (Sprint 7 pattern).
      telefone_normalizado: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      // Igual corretora_users — invalidação instantânea de sessões
      // quando precisamos (logout global, reset).
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
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex("producer_accounts", ["email"], {
      name: "uq_producer_accounts_email",
      unique: true,
    });
    await queryInterface.addIndex("producer_accounts", ["telefone_normalizado"], {
      name: "idx_producer_accounts_phone",
    });

    // ─── producer_favorites ────────────────────────────────────────
    await queryInterface.createTable("producer_favorites", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      producer_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "producer_accounts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addConstraint("producer_favorites", {
      type: "unique",
      fields: ["producer_id", "corretora_id"],
      name: "uq_producer_favorites",
    });

    // ─── producer_alert_subscriptions (esqueleto para fase futura) ──
    await queryInterface.createTable("producer_alert_subscriptions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      producer_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "producer_accounts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Tipos planejados: "cotacao_cafe_arabica", "nova_corretora_cidade",
      // "review_corretora_favorita", etc. Deliberadamente VARCHAR (não
      // ENUM) para permitir adição sem migration.
      type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      // Parâmetros livres: { cidade: "Manhuaçu", preco_min: 1800 } etc.
      params: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      channel: {
        type: Sequelize.ENUM("email"),
        allowNull: false,
        defaultValue: "email",
      },
      active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      last_sent_at: {
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
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex(
      "producer_alert_subscriptions",
      ["producer_id", "active"],
      { name: "idx_alerts_producer_active" },
    );

    // ─── Expande scope de password_reset_tokens ────────────────────
    // Já suporta "user" e "corretora_user"; acrescentamos
    // "producer_magic" via INSERT direto — o ENUM aceita strings novas
    // apenas via ALTER. Na prática, o codebase atual trata scope como
    // STRING, então basta usar o valor novo nos inserts.
    // (Se o tipo da coluna for ENUM, roda ALTER abaixo.)
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE password_reset_tokens
           MODIFY COLUMN scope VARCHAR(40) NOT NULL DEFAULT 'user'`,
      );
    } catch (e) {
      // Se já for VARCHAR, ignore.
      if (!String(e?.message || "").includes("doesn't exist")) {
        // silencioso; log no deploy
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("producer_alert_subscriptions");
    await queryInterface.dropTable("producer_favorites");
    await queryInterface.dropTable("producer_accounts");
  },
};
