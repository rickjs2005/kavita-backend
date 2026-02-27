/* eslint-disable no-unused-vars */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("CREATE TABLE `shipping_rates` (\n`id` int NOT NULL AUTO_INCREMENT,\n`faixa_cep_inicio` varchar(8) NOT NULL,\n`faixa_cep_fim` varchar(8) NOT NULL,\n`preco` decimal(10,2) NOT NULL,\n`prazo_dias` int NOT NULL,\n`ativo` tinyint(1) NOT NULL DEFAULT '1',\n`criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n`atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `idx_faixa` (`faixa_cep_inicio`,`faixa_cep_fim`),\nKEY `idx_ativo` (`ativo`)\n) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `shipping_zones` (\n`id` int NOT NULL AUTO_INCREMENT,\n`name` varchar(160) NOT NULL,\n`state` char(2) NOT NULL,\n`all_cities` tinyint(1) NOT NULL DEFAULT '0',\n`is_free` tinyint(1) NOT NULL DEFAULT '0',\n`price` decimal(10,2) NOT NULL DEFAULT '0.00',\n`prazo_dias` int DEFAULT NULL,\n`is_active` tinyint(1) NOT NULL DEFAULT '1',\n`created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n`updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `idx_state_active` (`state`,`is_active`),\nKEY `idx_active` (`is_active`)\n) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `shipping_zone_cities` (\n`id` int NOT NULL AUTO_INCREMENT,\n`zone_id` int NOT NULL,\n`city` varchar(160) NOT NULL,\nPRIMARY KEY (`id`),\nUNIQUE KEY `uk_zone_city` (`zone_id`,`city`),\nKEY `idx_zone` (`zone_id`),\nCONSTRAINT `shipping_zone_cities_ibfk_1` FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `shipping_zone_cities`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `shipping_zones`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `shipping_rates`;", { transaction: t });
    });
  },
};
