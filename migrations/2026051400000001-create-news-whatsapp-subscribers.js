"use strict";

/**
 * Migration: Create news_whatsapp_subscribers table.
 *
 * Stores phone numbers captured by the "Central no WhatsApp" card on the
 * /news home — the public Kavita News landing. Replaces the temporary
 * localStorage waitlist that the frontend used while no endpoint existed.
 *
 * Design notes:
 *   - `phone` is stored as digits only (no mask, no country prefix), so
 *     a UNIQUE index can dedup without ambiguity. The schema validator
 *     enforces 10 or 11 digits (Brazilian format with DDD, optional 9).
 *   - `status` defaults to 'pending'. When the operational WhatsApp
 *     channel goes live, an admin can flip subscribers to 'active'.
 *     'unsubscribed' is reserved for opt-out (LGPD).
 *   - `source` allows tracking where the subscriber came from
 *     ('home_news' for now; future: 'corretora_landing', etc.).
 *   - `ip` and `user_agent` are kept for fraud/abuse review only and
 *     should not surface in any analytics report.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("news_whatsapp_subscribers", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      phone: {
        // 13 cobre DDI(2) + DDD(2) + 9digitos; hoje guardamos só DDD+local.
        type: Sequelize.STRING(13),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "active", "unsubscribed"),
        allowNull: false,
        defaultValue: "pending",
      },
      source: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "home_news",
      },
      ip: {
        type: Sequelize.STRING(45), // IPv6 max length
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      criado_em: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      atualizado_em: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("news_whatsapp_subscribers", ["phone"], {
      name: "uk_news_whatsapp_subscribers_phone",
      unique: true,
    });

    await queryInterface.addIndex("news_whatsapp_subscribers", ["status"], {
      name: "idx_news_whatsapp_subscribers_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("news_whatsapp_subscribers");
  },
};
