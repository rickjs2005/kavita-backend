-- SCHEMA EXTRAÍDO DO BANCO REAL KAVITA

-- --------------------------------------------------
-- TABLE: admin_logs
-- --------------------------------------------------
CREATE TABLE `admin_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `acao` varchar(255) NOT NULL,
  `entidade` varchar(100) NOT NULL,
  `entidade_id` int DEFAULT NULL,
  `data` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_admin_logs_admin` (`admin_id`),
  CONSTRAINT `fk_admin_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=517 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: admin_permissions
-- --------------------------------------------------
CREATE TABLE `admin_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `chave` varchar(100) NOT NULL,
  `grupo` varchar(50) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chave` (`chave`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: admin_role_permissions
-- --------------------------------------------------
CREATE TABLE `admin_role_permissions` (
  `role_id` int unsigned NOT NULL,
  `permission_id` int unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `fk_admin_role_permissions_perm` (`permission_id`),
  CONSTRAINT `fk_admin_role_permissions_perm` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_admin_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: admin_roles
-- --------------------------------------------------
CREATE TABLE `admin_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: admins
-- --------------------------------------------------
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `senha` varchar(255) DEFAULT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'leitura',
  `role_id` int unsigned DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_login` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_admins_role` (`role_id`),
  CONSTRAINT `fk_admins_role` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: avaliacoes_servico
-- --------------------------------------------------
CREATE TABLE `avaliacoes_servico` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `colaborador_id` int NOT NULL,
  `nota` tinyint unsigned NOT NULL,
  `comentario` text,
  `autor_nome` varchar(120) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `colaborador_id` (`colaborador_id`),
  CONSTRAINT `avaliacoes_servico_ibfk_1` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: carrinho_itens
-- --------------------------------------------------
CREATE TABLE `carrinho_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `carrinho_id` int NOT NULL,
  `produto_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `valor_unitario` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `carrinho_id` (`carrinho_id`),
  KEY `produto_id` (`produto_id`),
  CONSTRAINT `carrinho_itens_ibfk_1` FOREIGN KEY (`carrinho_id`) REFERENCES `carrinhos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `carrinho_itens_ibfk_2` FOREIGN KEY (`produto_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: carrinhos
-- --------------------------------------------------
CREATE TABLE `carrinhos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `status` enum('aberto','convertido','cancelado') DEFAULT 'aberto',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_carrinhos_usuario_status_created` (`usuario_id`,`status`,`created_at`),
  CONSTRAINT `carrinhos_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: carrinhos_abandonados
-- --------------------------------------------------
CREATE TABLE `carrinhos_abandonados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `carrinho_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `itens` json NOT NULL,
  `total_estimado` decimal(10,2) NOT NULL DEFAULT '0.00',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `recuperado` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `carrinho_id` (`carrinho_id`),
  KEY `idx_carr_aband_usuario_created` (`usuario_id`,`criado_em`),
  KEY `idx_carr_aband_recuperado` (`recuperado`),
  CONSTRAINT `fk_carr_aband_cart` FOREIGN KEY (`carrinho_id`) REFERENCES `carrinhos` (`id`),
  CONSTRAINT `fk_carr_aband_user` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: carrinhos_abandonados_notifications
-- --------------------------------------------------
CREATE TABLE `carrinhos_abandonados_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `carrinho_abandonado_id` int NOT NULL,
  `tipo` enum('whatsapp','email') NOT NULL,
  `scheduled_at` datetime NOT NULL,
  `sent_at` datetime DEFAULT NULL,
  `status` enum('pending','sent','error','canceled') NOT NULL DEFAULT 'pending',
  `error_message` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cart_tipo_scheduled` (`carrinho_abandonado_id`,`tipo`,`scheduled_at`),
  KEY `idx_status_scheduled` (`status`,`scheduled_at`),
  CONSTRAINT `fk_carrinho_aband_notif` FOREIGN KEY (`carrinho_abandonado_id`) REFERENCES `carrinhos_abandonados` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: categories
-- --------------------------------------------------
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `description` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_categories_slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: colaborador_images
-- --------------------------------------------------
CREATE TABLE `colaborador_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `colaborador_id` int NOT NULL,
  `path` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_colab` (`colaborador_id`),
  CONSTRAINT `colaborador_images_ibfk_1` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_colabimg_colab` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: colaboradores
-- --------------------------------------------------
CREATE TABLE `colaboradores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) DEFAULT NULL,
  `cargo` varchar(100) DEFAULT NULL,
  `whatsapp` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `imagem` varchar(255) DEFAULT NULL,
  `descricao` text,
  `especialidade_id` int DEFAULT NULL,
  `servico_id` int DEFAULT NULL,
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int NOT NULL DEFAULT '0',
  `total_servicos` int NOT NULL DEFAULT '0',
  `views_count` int NOT NULL DEFAULT '0',
  `whatsapp_clicks` int NOT NULL DEFAULT '0',
  `verificado` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_especialidade` (`especialidade_id`),
  KEY `fk_colaboradores_servico` (`servico_id`),
  CONSTRAINT `fk_colaboradores_servico` FOREIGN KEY (`servico_id`) REFERENCES `services` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_especialidade` FOREIGN KEY (`especialidade_id`) REFERENCES `especialidades` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: comunicacoes_enviadas
-- --------------------------------------------------
CREATE TABLE `comunicacoes_enviadas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int DEFAULT NULL,
  `pedido_id` int DEFAULT NULL,
  `canal` enum('email','whatsapp') NOT NULL,
  `tipo_template` varchar(50) NOT NULL,
  `destino` varchar(191) NOT NULL,
  `assunto` varchar(191) DEFAULT NULL,
  `mensagem` text NOT NULL,
  `status_envio` enum('sucesso','erro') NOT NULL DEFAULT 'sucesso',
  `erro` text,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `pedido_id` (`pedido_id`),
  CONSTRAINT `fk_comunicacoes_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),
  CONSTRAINT `fk_comunicacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: cupons
-- --------------------------------------------------
CREATE TABLE `cupons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL,
  `tipo` enum('percentual','valor') NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `minimo` decimal(10,2) DEFAULT '0.00',
  `expiracao` datetime DEFAULT NULL,
  `usos` int unsigned NOT NULL DEFAULT '0',
  `max_usos` int unsigned DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_comment_media
-- --------------------------------------------------
CREATE TABLE `drone_comment_media` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comment_id` int NOT NULL,
  `media_type` enum('IMAGE','VIDEO') NOT NULL,
  `media_path` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_media_comment` (`comment_id`),
  KEY `idx_media_created` (`created_at`),
  CONSTRAINT `fk_comment_media_comment` FOREIGN KEY (`comment_id`) REFERENCES `drone_comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_comments
-- --------------------------------------------------
CREATE TABLE `drone_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model_key` varchar(20) DEFAULT NULL,
  `display_name` varchar(80) DEFAULT NULL,
  `comment_text` varchar(1000) NOT NULL,
  `status` enum('PENDENTE','APROVADO','REPROVADO') NOT NULL DEFAULT 'PENDENTE',
  `ip_hash` char(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comment_status_created` (`status`,`created_at`),
  KEY `idx_comment_created` (`created_at`),
  KEY `idx_drone_comments_model_created` (`model_key`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_gallery_items
-- --------------------------------------------------
CREATE TABLE `drone_gallery_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model_key` varchar(20) DEFAULT NULL,
  `media_type` enum('IMAGE','VIDEO') NOT NULL,
  `media_path` varchar(255) NOT NULL,
  `caption` varchar(160) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_active_order` (`is_active`,`sort_order`),
  KEY `idx_gallery_created` (`created_at`),
  KEY `idx_drone_gallery_model_sort_active` (`model_key`,`sort_order`,`is_active`),
  KEY `idx_drone_gallery_items_model_key` (`model_key`),
  KEY `idx_drone_gallery_items_model_active_order` (`model_key`,`is_active`,`sort_order`),
  CONSTRAINT `fk_gallery_model_key` FOREIGN KEY (`model_key`) REFERENCES `drone_models` (`key`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_model_media_selections
-- --------------------------------------------------
CREATE TABLE `drone_model_media_selections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model_key` varchar(20) NOT NULL,
  `target` enum('HERO','CARD') NOT NULL,
  `media_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_model_target` (`model_key`,`target`),
  KEY `fk_sel_media` (`media_id`),
  CONSTRAINT `fk_sel_media` FOREIGN KEY (`media_id`) REFERENCES `drone_gallery_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sel_model` FOREIGN KEY (`model_key`) REFERENCES `drone_models` (`key`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_models
-- --------------------------------------------------
CREATE TABLE `drone_models` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(20) NOT NULL,
  `label` varchar(120) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_drone_models_key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_page_settings
-- --------------------------------------------------
CREATE TABLE `drone_page_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `hero_title` varchar(120) NOT NULL,
  `hero_subtitle` varchar(255) DEFAULT NULL,
  `hero_video_path` varchar(255) DEFAULT NULL,
  `hero_image_fallback_path` varchar(255) DEFAULT NULL,
  `cta_title` varchar(120) DEFAULT NULL,
  `cta_message_template` varchar(500) DEFAULT NULL,
  `cta_button_label` varchar(60) DEFAULT NULL,
  `specs_title` varchar(120) DEFAULT NULL,
  `specs_items_json` json DEFAULT NULL,
  `features_title` varchar(120) DEFAULT NULL,
  `features_items_json` json DEFAULT NULL,
  `benefits_title` varchar(120) DEFAULT NULL,
  `benefits_items_json` json DEFAULT NULL,
  `sections_order_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `models_json` json DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: drone_representatives
-- --------------------------------------------------
CREATE TABLE `drone_representatives` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `whatsapp` varchar(30) NOT NULL,
  `cnpj` varchar(20) NOT NULL,
  `instagram_url` varchar(255) DEFAULT NULL,
  `address_street` varchar(120) NOT NULL,
  `address_number` varchar(30) NOT NULL,
  `address_complement` varchar(80) DEFAULT NULL,
  `address_neighborhood` varchar(80) DEFAULT NULL,
  `address_city` varchar(80) DEFAULT NULL,
  `address_uf` char(2) DEFAULT NULL,
  `address_cep` varchar(15) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rep_active_order` (`is_active`,`sort_order`),
  KEY `idx_rep_city_uf` (`address_city`,`address_uf`),
  KEY `idx_rep_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: enderecos_usuario
-- --------------------------------------------------
CREATE TABLE `enderecos_usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `apelido` varchar(50) DEFAULT NULL,
  `cep` varchar(20) NOT NULL,
  `endereco` varchar(255) NOT NULL,
  `numero` varchar(20) NOT NULL,
  `bairro` varchar(100) NOT NULL,
  `cidade` varchar(100) NOT NULL,
  `estado` varchar(50) NOT NULL,
  `complemento` varchar(255) DEFAULT NULL,
  `ponto_referencia` varchar(255) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tipo_localidade` enum('URBANA','RURAL') NOT NULL DEFAULT 'URBANA',
  `comunidade` varchar(255) DEFAULT NULL,
  `observacoes_acesso` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_enderecos_usuario_usuario_default` (`usuario_id`,`is_default`),
  KEY `idx_enderecos_usuario_tipo_localidade` (`tipo_localidade`),
  CONSTRAINT `enderecos_usuario_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_enderecos_usuario_rural_required` CHECK (((`tipo_localidade` <> _utf8mb4'RURAL') or ((`comunidade` is not null) and (trim(`comunidade`) <> _utf8mb4'') and (`observacoes_acesso` is not null) and (trim(`observacoes_acesso`) <> _utf8mb4''))))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: especialidades
-- --------------------------------------------------
CREATE TABLE `especialidades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: favorites
-- --------------------------------------------------
CREATE TABLE `favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `product_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_product` (`user_id`,`product_id`),
  KEY `fk_favorites_product` (`product_id`),
  CONSTRAINT `fk_favorites_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: news_clima
-- --------------------------------------------------
CREATE TABLE `news_clima` (
  `id` int NOT NULL AUTO_INCREMENT,
  `city_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uf` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ibge_id` int unsigned DEFAULT NULL,
  `station_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station_uf` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station_lat` decimal(9,6) DEFAULT NULL,
  `station_lon` decimal(9,6) DEFAULT NULL,
  `station_distance` decimal(8,2) DEFAULT NULL,
  `station_distance_km` decimal(8,2) DEFAULT NULL,
  `ibge_source` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station_source` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_sync_observed_at` datetime DEFAULT NULL,
  `last_sync_forecast_at` datetime DEFAULT NULL,
  `mm_24h` decimal(8,2) DEFAULT NULL,
  `mm_7d` decimal(8,2) DEFAULT NULL,
  `source` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_update_at` datetime DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_news_clima_slug` (`slug`),
  KEY `idx_news_clima_ativo` (`ativo`),
  KEY `idx_news_clima_uf` (`uf`),
  KEY `idx_news_clima_ibge_id` (`ibge_id`),
  KEY `idx_news_clima_station_code` (`station_code`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------
-- TABLE: news_cotacoes
-- --------------------------------------------------
CREATE TABLE `news_cotacoes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_key` enum('graos','pecuaria','cambio') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'graos',
  `type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,4) DEFAULT NULL,
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variation_day` decimal(10,4) DEFAULT NULL,
  `market` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_update_at` datetime DEFAULT NULL,
  `last_sync_status` enum('ok','error','skipped') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_sync_message` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_news_cotacoes_slug` (`slug`),
  KEY `idx_news_cotacoes_type` (`type`),
  KEY `idx_news_cotacoes_ativo` (`ativo`),
  KEY `idx_news_cotacoes_last_update` (`last_update_at`),
  KEY `idx_news_cotacoes_group_key` (`group_key`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------
-- TABLE: news_cotacoes_history
-- --------------------------------------------------
CREATE TABLE `news_cotacoes_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cotacao_id` int unsigned NOT NULL,
  `price` decimal(12,4) DEFAULT NULL,
  `variation_day` decimal(12,4) DEFAULT NULL,
  `source` varchar(120) DEFAULT NULL,
  `observed_at` datetime DEFAULT NULL,
  `sync_status` enum('ok','error') NOT NULL DEFAULT 'ok',
  `sync_message` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cotacao_created` (`cotacao_id`,`created_at`),
  CONSTRAINT `fk_cotacoes_history` FOREIGN KEY (`cotacao_id`) REFERENCES `news_cotacoes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: news_posts
-- --------------------------------------------------
CREATE TABLE `news_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(220) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(240) COLLATE utf8mb4_unicode_ci NOT NULL,
  `excerpt` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `cover_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tags` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','published','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `author_admin_id` int DEFAULT NULL,
  `views` int NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_news_posts_slug` (`slug`),
  KEY `idx_news_posts_status_pub` (`status`,`published_at`),
  KEY `idx_news_posts_author` (`author_admin_id`),
  KEY `idx_news_posts_ativo` (`ativo`),
  FULLTEXT KEY `ft_news_posts_search` (`title`,`excerpt`,`content`),
  CONSTRAINT `fk_news_posts_author_admin` FOREIGN KEY (`author_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------
-- TABLE: password_reset_tokens
-- --------------------------------------------------
CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_user_expires` (`user_id`,`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: payment_methods
-- --------------------------------------------------
CREATE TABLE `payment_methods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `label` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: pedidos
-- --------------------------------------------------
CREATE TABLE `pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `endereco` text NOT NULL,
  `forma_pagamento` varchar(50) NOT NULL,
  `status_pagamento` enum('pendente','pago','falhou','estornado') DEFAULT 'pendente',
  `status_entrega` enum('em_separacao','processando','enviado','entregue','cancelado') DEFAULT 'em_separacao',
  `data_pedido` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(50) DEFAULT 'pendente',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagamento_id` varchar(64) DEFAULT NULL,
  `shipping_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `shipping_rule_applied` varchar(32) DEFAULT NULL,
  `shipping_prazo_dias` int DEFAULT NULL,
  `shipping_cep` varchar(8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `idx_pedidos_pagamento` (`pagamento_id`),
  KEY `idx_pedidos_shipping_cep` (`shipping_cep`),
  CONSTRAINT `pedidos_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: pedidos_produtos
-- --------------------------------------------------
CREATE TABLE `pedidos_produtos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedido_id` int NOT NULL,
  `produto_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `valor_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_pedido_item` (`pedido_id`,`produto_id`),
  KEY `produto_id` (`produto_id`),
  CONSTRAINT `pedidos_produtos_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pedidos_produtos_ibfk_2` FOREIGN KEY (`produto_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: product_categories
-- --------------------------------------------------
CREATE TABLE `product_categories` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `category_id` int DEFAULT NULL,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: product_images
-- --------------------------------------------------
CREATE TABLE `product_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `path` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_images_pid` (`product_id`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: product_promotions
-- --------------------------------------------------
CREATE TABLE `product_promotions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `title` varchar(120) DEFAULT NULL,
  `type` enum('PROMOCAO','FLASH') NOT NULL DEFAULT 'PROMOCAO',
  `discount_percent` decimal(5,2) DEFAULT NULL,
  `promo_price` decimal(10,2) DEFAULT NULL,
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_destaques_product` (`product_id`),
  KEY `idx_promos_active_window` (`is_active`,`start_at`,`end_at`,`product_id`),
  KEY `idx_promos_product_id` (`product_id`,`id`),
  CONSTRAINT `fk_destaques_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_promotions_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: products
-- --------------------------------------------------
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL DEFAULT '',
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `image` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `rating_avg` decimal(3,2) DEFAULT '0.00',
  `rating_count` int unsigned DEFAULT '0',
  `quantity` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `category_id` int DEFAULT NULL,
  `sold_count` int unsigned NOT NULL DEFAULT '0',
  `shipping_free` tinyint(1) NOT NULL DEFAULT '0',
  `shipping_free_from_qty` int DEFAULT NULL,
  `shipping_prazo_dias` int DEFAULT NULL COMMENT 'Prazo próprio do produto (em dias)',
  PRIMARY KEY (`id`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_name` (`name`),
  KEY `idx_products_description` (`description`(100)),
  KEY `idx_products_category_id` (`category_id`),
  KEY `idx_products_price` (`price`),
  KEY `idx_products_created_at` (`created_at`),
  KEY `idx_products_sold_count` (`sold_count`),
  CONSTRAINT `fk_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: produto_avaliacoes
-- --------------------------------------------------
CREATE TABLE `produto_avaliacoes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `nota` tinyint unsigned NOT NULL,
  `comentario` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_produto_avaliacoes_produto` (`produto_id`),
  KEY `fk_produto_avaliacoes_usuario` (`usuario_id`),
  CONSTRAINT `fk_produto_avaliacoes_produto` FOREIGN KEY (`produto_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_produto_avaliacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: sequelizemeta
-- --------------------------------------------------
CREATE TABLE `sequelizemeta` (
  `name` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`name`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------
-- TABLE: shipping_rates
-- --------------------------------------------------
CREATE TABLE `shipping_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `faixa_cep_inicio` varchar(8) NOT NULL,
  `faixa_cep_fim` varchar(8) NOT NULL,
  `preco` decimal(10,2) NOT NULL,
  `prazo_dias` int NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_faixa` (`faixa_cep_inicio`,`faixa_cep_fim`),
  KEY `idx_ativo` (`ativo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: shipping_zone_cities
-- --------------------------------------------------
CREATE TABLE `shipping_zone_cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `zone_id` int NOT NULL,
  `city` varchar(160) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_zone_city` (`zone_id`,`city`),
  KEY `idx_zone` (`zone_id`),
  CONSTRAINT `shipping_zone_cities_ibfk_1` FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: shipping_zones
-- --------------------------------------------------
CREATE TABLE `shipping_zones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) NOT NULL,
  `state` char(2) NOT NULL,
  `all_cities` tinyint(1) NOT NULL DEFAULT '0',
  `is_free` tinyint(1) NOT NULL DEFAULT '0',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `prazo_dias` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_state_active` (`state`,`is_active`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: shop_settings
-- --------------------------------------------------
CREATE TABLE `shop_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `store_name` varchar(150) NOT NULL DEFAULT 'Kavita',
  `store_slug` varchar(100) DEFAULT NULL,
  `cnpj` varchar(20) DEFAULT NULL,
  `main_email` varchar(150) DEFAULT NULL,
  `main_whatsapp` varchar(30) DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `checkout_require_cpf` tinyint(1) NOT NULL DEFAULT '1',
  `checkout_require_address` tinyint(1) NOT NULL DEFAULT '1',
  `checkout_allow_pickup` tinyint(1) NOT NULL DEFAULT '0',
  `checkout_enable_coupons` tinyint(1) NOT NULL DEFAULT '1',
  `checkout_enable_abandoned_cart` tinyint(1) NOT NULL DEFAULT '1',
  `payment_pix_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `payment_card_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `payment_boleto_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `mp_public_key` varchar(200) DEFAULT NULL,
  `mp_access_token` varchar(200) DEFAULT NULL,
  `mp_auto_return` varchar(50) DEFAULT 'approved',
  `mp_sandbox_mode` tinyint(1) NOT NULL DEFAULT '1',
  `shipping_flat_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `shipping_flat_value` decimal(10,2) NOT NULL DEFAULT '0.00',
  `shipping_free_over` decimal(10,2) NOT NULL DEFAULT '0.00',
  `shipping_region_text` varchar(255) DEFAULT NULL,
  `shipping_deadline_text` varchar(255) DEFAULT NULL,
  `comm_email_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `comm_whatsapp_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `seo_title` varchar(160) DEFAULT NULL,
  `seo_description` varchar(255) DEFAULT NULL,
  `google_analytics_id` varchar(50) DEFAULT NULL,
  `facebook_pixel_id` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `footer_tagline` varchar(255) DEFAULT NULL,
  `contact_whatsapp` varchar(50) DEFAULT NULL,
  `contact_email` varchar(120) DEFAULT NULL,
  `social_instagram_url` varchar(255) DEFAULT NULL,
  `social_whatsapp_url` varchar(255) DEFAULT NULL,
  `footer_partner_cta_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `footer_partner_cta_title` varchar(80) DEFAULT NULL,
  `footer_partner_cta_text` varchar(500) DEFAULT NULL,
  `footer_partner_cta_href` varchar(120) DEFAULT NULL,
  `footer_links` json DEFAULT NULL,
  `address_city` varchar(80) DEFAULT NULL,
  `address_state` varchar(2) DEFAULT NULL,
  `address_street` varchar(120) DEFAULT NULL,
  `address_neighborhood` varchar(80) DEFAULT NULL,
  `address_zip` varchar(12) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: site_hero_settings
-- --------------------------------------------------
CREATE TABLE `site_hero_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `hero_video_url` varchar(255) DEFAULT NULL,
  `hero_video_path` varchar(255) DEFAULT NULL,
  `hero_image_url` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `subtitle` varchar(500) DEFAULT NULL,
  `hero_image_path` varchar(255) DEFAULT NULL,
  `button_label` varchar(80) NOT NULL DEFAULT 'Saiba Mais',
  `button_href` varchar(255) NOT NULL DEFAULT '/drones',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: solicitacoes_servico
-- --------------------------------------------------
CREATE TABLE `solicitacoes_servico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `colaborador_id` int NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `nome_contato` varchar(120) NOT NULL,
  `whatsapp` varchar(30) NOT NULL,
  `descricao` text NOT NULL,
  `origem` varchar(50) DEFAULT 'site',
  `status` enum('novo','em_contato','concluido','cancelado') DEFAULT 'novo',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_solic_colab` (`colaborador_id`),
  CONSTRAINT `fk_solic_colab` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------
-- TABLE: usuarios
-- --------------------------------------------------
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `data_nascimento` date DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `cpf` varchar(14) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resetToken` varchar(255) DEFAULT NULL,
  `resetTokenExpires` datetime DEFAULT NULL,
  `pais` varchar(100) DEFAULT NULL,
  `estado` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `cep` varchar(10) DEFAULT NULL,
  `ponto_referencia` varchar(255) DEFAULT NULL,
  `status_conta` enum('ativo','bloqueado') NOT NULL DEFAULT 'ativo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `usuarios_cpf_unique` (`cpf`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

