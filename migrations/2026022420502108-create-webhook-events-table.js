/* eslint-disable no-unused-vars */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        "CREATE TABLE `webhook_events` (\n" +
          "`id` int NOT NULL AUTO_INCREMENT,\n" +
          "`event_id` varchar(64) NOT NULL,\n" +
          "`signature` text,\n" +
          "`event_type` varchar(64) DEFAULT NULL,\n" +
          "`payload` json DEFAULT NULL,\n" +
          "`status` enum('received','ignored','pendente','pago','falhou') NOT NULL DEFAULT 'received',\n" +
          "`processed_at` datetime DEFAULT NULL,\n" +
          "`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n" +
          "`updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,\n" +
          "PRIMARY KEY (`id`),\n" +
          "UNIQUE KEY `uniq_event_id` (`event_id`)\n" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
        { transaction: t }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `webhook_events`;", {
        transaction: t,
      });
    });
  },
};
