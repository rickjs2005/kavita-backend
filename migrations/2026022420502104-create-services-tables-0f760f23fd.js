/* eslint-disable no-unused-vars */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("CREATE TABLE `especialidades` (\n`id` int NOT NULL AUTO_INCREMENT,\n`nome` varchar(100) NOT NULL,\nPRIMARY KEY (`id`)\n) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `colaboradores` (\n`id` int NOT NULL AUTO_INCREMENT,\n`nome` varchar(100) DEFAULT NULL,\n`cargo` varchar(100) DEFAULT NULL,\n`whatsapp` varchar(20) DEFAULT NULL,\n`email` varchar(255) DEFAULT NULL,\n`imagem` varchar(255) DEFAULT NULL,\n`descricao` text,\n`especialidade_id` int DEFAULT NULL,\n`servico_id` int DEFAULT NULL,\n`rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',\n`rating_count` int NOT NULL DEFAULT '0',\n`total_servicos` int NOT NULL DEFAULT '0',\n`views_count` int NOT NULL DEFAULT '0',\n`whatsapp_clicks` int NOT NULL DEFAULT '0',\n`verificado` tinyint(1) NOT NULL DEFAULT '0',\n`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `fk_especialidade` (`especialidade_id`),\nKEY `fk_colaboradores_servico` (`servico_id`),\nCONSTRAINT `fk_especialidade` FOREIGN KEY (`especialidade_id`) REFERENCES `especialidades` (`id`)\n) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `avaliacoes_servico` (\n`id` int unsigned NOT NULL AUTO_INCREMENT,\n`colaborador_id` int NOT NULL,\n`nota` tinyint unsigned NOT NULL,\n`comentario` text,\n`autor_nome` varchar(120) DEFAULT NULL,\n`created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `colaborador_id` (`colaborador_id`),\nCONSTRAINT `avaliacoes_servico_ibfk_1` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `colaborador_images` (\n`id` int NOT NULL AUTO_INCREMENT,\n`colaborador_id` int NOT NULL,\n`path` varchar(255) NOT NULL,\nPRIMARY KEY (`id`),\nKEY `idx_colab` (`colaborador_id`),\nCONSTRAINT `colaborador_images_ibfk_1` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE,\nCONSTRAINT `fk_colabimg_colab` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `solicitacoes_servico` (\n`id` int NOT NULL AUTO_INCREMENT,\n`colaborador_id` int NOT NULL,\n`usuario_id` int DEFAULT NULL,\n`nome_contato` varchar(120) NOT NULL,\n`whatsapp` varchar(30) NOT NULL,\n`descricao` text NOT NULL,\n`origem` varchar(50) DEFAULT 'site',\n`status` enum('novo','em_contato','concluido','cancelado') DEFAULT 'novo',\n`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n`updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `fk_solic_colab` (`colaborador_id`),\nCONSTRAINT `fk_solic_colab` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
      await queryInterface.sequelize.query("CREATE TABLE `comunicacoes_enviadas` (\n`id` int NOT NULL AUTO_INCREMENT,\n`usuario_id` int DEFAULT NULL,\n`pedido_id` int DEFAULT NULL,\n`canal` enum('email','whatsapp') NOT NULL,\n`tipo_template` varchar(50) NOT NULL,\n`destino` varchar(191) NOT NULL,\n`assunto` varchar(191) DEFAULT NULL,\n`mensagem` text NOT NULL,\n`status_envio` enum('sucesso','erro') NOT NULL DEFAULT 'sucesso',\n`erro` text,\n`criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\nPRIMARY KEY (`id`),\nKEY `usuario_id` (`usuario_id`),\nKEY `pedido_id` (`pedido_id`),\nCONSTRAINT `fk_comunicacoes_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),\nCONSTRAINT `fk_comunicacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)\n) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", { transaction: t });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `comunicacoes_enviadas`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `solicitacoes_servico`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `colaborador_images`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `avaliacoes_servico`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `colaboradores`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `especialidades`;", { transaction: t });
    });
  },
};
