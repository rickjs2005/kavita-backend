/* eslint-disable no-unused-vars */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("CREATE TABLE `admin_permissions` (\n`id` int unsigned NOT NULL AUTO_INCREMENT,\n`chave` varchar(100) NOT NULL,\n`grupo` varchar(50) NOT NULL,\n`descricao` varchar(255) DEFAULT NULL,\nPRIMARY KEY (`id`),\nUNIQUE KEY `chave` (`chave`)\n) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `admin_roles` (\n`id` int unsigned NOT NULL AUTO_INCREMENT,\n`nome` varchar(100) NOT NULL,\n`slug` varchar(50) NOT NULL,\n`descricao` varchar(255) DEFAULT NULL,\n`is_system` tinyint(1) NOT NULL DEFAULT '0',\n`criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nUNIQUE KEY `slug` (`slug`)\n) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `admin_role_permissions` (\n`role_id` int unsigned NOT NULL,\n`permission_id` int unsigned NOT NULL,\nPRIMARY KEY (`role_id`,`permission_id`),\nKEY `fk_admin_role_permissions_perm` (`permission_id`),\nCONSTRAINT `fk_admin_role_permissions_perm` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE,\nCONSTRAINT `fk_admin_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `admins` (\n`id` int NOT NULL AUTO_INCREMENT,\n`nome` varchar(100) DEFAULT NULL,\n`email` varchar(100) DEFAULT NULL,\n`senha` varchar(255) DEFAULT NULL,\n`role` varchar(50) NOT NULL DEFAULT 'leitura',\n`role_id` int unsigned DEFAULT NULL,\n`ativo` tinyint(1) NOT NULL DEFAULT '1',\n`criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n`ultimo_login` datetime DEFAULT NULL,\nPRIMARY KEY (`id`),\nUNIQUE KEY `email` (`email`),\nKEY `fk_admins_role` (`role_id`),\nCONSTRAINT `fk_admins_role` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE SET NULL\n) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `admin_logs` (\n`id` int NOT NULL AUTO_INCREMENT,\n`admin_id` int NOT NULL,\n`acao` varchar(255) NOT NULL,\n`entidade` varchar(100) NOT NULL,\n`entidade_id` int DEFAULT NULL,\n`data` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `fk_admin_logs_admin` (`admin_id`),\nCONSTRAINT `fk_admin_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB AUTO_INCREMENT=517 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `admin_logs`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `admins`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `admin_role_permissions`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `admin_roles`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `admin_permissions`;", { transaction: t });
    });
  },
};
