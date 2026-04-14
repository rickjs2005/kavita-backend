"use strict";

// Sprint 6B — Notificações in-panel para a corretora.
//
// Modelo: notificações pertencem à CORRETORA (não ao user), então
// toda a equipe vê as mesmas notificações do lead que chegou. Cada
// user pode marcar individualmente como lida — por isso a tabela
// relacional corretora_notification_reads.
//
// Alternativa considerada: 1 notification por user. Rejeitada porque
// multiplicaria linhas em equipe de 10 pessoas por lead recebido
// (explosão de escrita).

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── Notificações da corretora ──────────────────────────────
    await queryInterface.createTable("corretora_notifications", {
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
      // Tipos conhecidos (extensível): "lead.new", "lead.stale",
      // "review.new", "system".
      type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      body: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      link: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Metadata extra (JSON livre): lead_id, review_id, etc.
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "corretora_notifications",
      ["corretora_id", "created_at"],
      { name: "idx_notif_corretora_created" },
    );

    // ─── Reads (marcação por usuário) ───────────────────────────
    await queryInterface.createTable("corretora_notification_reads", {
      notification_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_notifications", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addConstraint("corretora_notification_reads", {
      type: "primary key",
      fields: ["notification_id", "user_id"],
      name: "pk_notification_reads",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_notification_reads");
    await queryInterface.dropTable("corretora_notifications");
  },
};
