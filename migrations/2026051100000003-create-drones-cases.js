"use strict";

// Cases comerciais reais do módulo Kavita Drones.
//
// Hoje "case" e "comentário" são a mesma coisa — comentário moderado
// com fotos. Mas case é diferente: tem nome de fazenda, produtor,
// cidade/UF, hectares, modelo aplicado, depoimento estruturado e
// permissão de uso. É o material que vende drone para o produtor
// rural desconfiado, e precisa ter campos próprios para filtrar
// na landing por modelo, região, escala.
//
// permission_to_use é flag obrigatória para LGPD/uso de imagem —
// admin só publica case se o produtor consentiu.
//
// Campos de imagem armazenam URL/path completo (mesmo padrão de
// drone_gallery_items.media_path). Upload via mediaService no
// controller, salvando em /uploads/drones/cases/.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("drones_cases", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      farm_name: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      producer_name: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      uf: {
        type: Sequelize.STRING(2),
        allowNull: true,
      },
      // Hectares aplicados — DECIMAL(10,2) suporta até ~99 milhões com 2 casas.
      hectares: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      // Bate com drone_models.key, mas sem FK rígida — case histórico
      // sobrevive se modelo for removido (não é desejado, mas seguro).
      model_key: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      summary: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      testimonial: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      cover_image_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      before_image_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      after_image_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // LGPD: case só é publicável com permissão expressa do produtor.
      // Admin marca este flag ao confirmar autorização (verbal/escrita).
      permission_to_use: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    // Público filtra por is_active=1 ordenado por sort_order.
    // Admin ordena pelo mesmo campo, com filtro opcional por modelo.
    await queryInterface.addIndex(
      "drones_cases",
      ["is_active", "sort_order"],
      { name: "idx_drones_cases_active_order" },
    );
    await queryInterface.addIndex(
      "drones_cases",
      ["model_key"],
      { name: "idx_drones_cases_model" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("drones_cases");
  },
};
