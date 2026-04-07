"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("hero_slides", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: "",
      },
      subtitle: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      badge_text: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      slide_type: {
        type: Sequelize.ENUM("promotional", "institutional", "informational"),
        allowNull: false,
        defaultValue: "institutional",
      },
      hero_video_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      hero_video_path: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      hero_image_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      hero_image_path: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      button_label: {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: "Saiba Mais",
      },
      button_href: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: "/drones",
      },
      button_secondary_label: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      button_secondary_href: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      starts_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ends_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("hero_slides", ["is_active", "sort_order"], {
      name: "idx_hero_slides_active_order",
    });

    // Migrate existing singleton hero data as the first slide
    await queryInterface.sequelize.query(`
      INSERT INTO hero_slides (title, subtitle, hero_video_url, hero_video_path,
        hero_image_url, hero_image_path, button_label, button_href, sort_order, is_active)
      SELECT
        COALESCE(title, ''),
        subtitle,
        hero_video_url,
        hero_video_path,
        hero_image_url,
        hero_image_path,
        COALESCE(button_label, 'Saiba Mais'),
        COALESCE(button_href, '/drones'),
        0,
        1
      FROM site_hero_settings
      LIMIT 1
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("hero_slides");
  },
};
