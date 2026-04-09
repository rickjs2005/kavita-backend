"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("support_config", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },

      // ── Hero ──
      hero_badge: { type: Sequelize.STRING(100), allowNull: true },
      hero_title: { type: Sequelize.STRING(200), allowNull: true },
      hero_highlight: { type: Sequelize.STRING(200), allowNull: true },
      hero_description: { type: Sequelize.TEXT, allowNull: true },
      hero_cta_primary: { type: Sequelize.STRING(80), allowNull: true },
      hero_cta_secondary: { type: Sequelize.STRING(80), allowNull: true },
      hero_sla: { type: Sequelize.STRING(100), allowNull: true },
      hero_schedule: { type: Sequelize.STRING(100), allowNull: true },
      hero_status: { type: Sequelize.STRING(100), allowNull: true },

      // ── Canais ──
      whatsapp_button_label: { type: Sequelize.STRING(80), allowNull: true },
      show_whatsapp_widget: { type: Sequelize.TINYINT(1), allowNull: false, defaultValue: 1 },
      show_chatbot: { type: Sequelize.TINYINT(1), allowNull: false, defaultValue: 1 },

      // ── Visibilidade de secoes ──
      show_faq: { type: Sequelize.TINYINT(1), allowNull: false, defaultValue: 1 },
      show_form: { type: Sequelize.TINYINT(1), allowNull: false, defaultValue: 1 },
      show_trust: { type: Sequelize.TINYINT(1), allowNull: false, defaultValue: 1 },

      // ── Formulario ──
      form_title: { type: Sequelize.STRING(200), allowNull: true },
      form_subtitle: { type: Sequelize.STRING(300), allowNull: true },
      form_success_title: { type: Sequelize.STRING(200), allowNull: true },
      form_success_message: { type: Sequelize.TEXT, allowNull: true },

      // ── FAQ ──
      faq_title: { type: Sequelize.STRING(200), allowNull: true },
      faq_subtitle: { type: Sequelize.STRING(300), allowNull: true },
      faq_topics: { type: Sequelize.JSON, allowNull: true },

      // ── Confianca ──
      trust_title: { type: Sequelize.STRING(200), allowNull: true },
      trust_subtitle: { type: Sequelize.STRING(300), allowNull: true },
      trust_items: { type: Sequelize.JSON, allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("support_config");
  },
};
