"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contato_analytics", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      event_type: {
        type: Sequelize.ENUM("faq_topic_view", "faq_search", "form_start", "whatsapp_hero_click"),
        allowNull: false,
      },
      event_value: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("contato_analytics", ["event_type", "created_at"], {
      name: "idx_contato_analytics_type_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contato_analytics");
  },
};
