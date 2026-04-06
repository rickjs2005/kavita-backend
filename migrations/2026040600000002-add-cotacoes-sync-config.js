"use strict";

/**
 * Migration: Add cotações sync config columns to news_sync_config.
 *
 * Mirrors the clima sync pattern — persists mode and cron expression
 * so admins can toggle automatic sync from the UI (not just env vars).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("news_sync_config", "cotacoes_sync_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("news_sync_config", "cotacoes_sync_cron", {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: "0 */4 * * *",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("news_sync_config", "cotacoes_sync_cron");
    await queryInterface.removeColumn("news_sync_config", "cotacoes_sync_enabled");
  },
};
