/* eslint-disable no-unused-vars */
"use strict";

/**
 * Migration: cria a tabela webhook_events para idempotência de webhooks do Mercado Pago.
 *
 * UNIQUE KEY em idempotency_key garante que eventos duplicados sejam detectados
 * e ignorados de forma segura (race condition protegida por FOR UPDATE na transação).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `CREATE TABLE \`webhook_events\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`idempotency_key\` varchar(128) NOT NULL,
        \`signature\` varchar(512) DEFAULT NULL,
        \`event_type\` varchar(64) DEFAULT NULL,
        \`payload\` json DEFAULT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'received',
        \`processed_at\` datetime DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_webhook_idempotency_key\` (\`idempotency_key\`),
        KEY \`idx_webhook_events_status\` (\`status\`),
        KEY \`idx_webhook_events_created_at\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS `webhook_events`;");
  },
};
