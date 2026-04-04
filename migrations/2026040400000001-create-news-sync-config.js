"use strict";

/**
 * Migration: Create news_sync_config table.
 *
 * Single-row singleton table that persists clima sync configuration
 * (mode, cron expression, delay). Replaces env-var-only configuration
 * so admins can toggle sync mode from the UI.
 *
 * The CHECK constraint and default INSERT guarantee exactly one row.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("news_sync_config", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        defaultValue: 1,
        allowNull: false,
      },
      clima_sync_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      clima_sync_cron: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "0 */3 * * *",
      },
      clima_sync_delay_ms: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1500,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Seed singleton row
    await queryInterface.sequelize.query(
      "INSERT INTO news_sync_config (id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms) VALUES (1, 0, '0 */3 * * *', 1500)"
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("news_sync_config");
  },
};
