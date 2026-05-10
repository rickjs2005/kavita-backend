"use strict";

/**
 * Migration: Add opt-in confirmation columns to news_whatsapp_subscribers.
 *
 * Estado atual: o POST /api/news/whatsapp-subscribe cria registros como
 * "pending" mas não havia caminho para o produtor confirmar de fato a
 * inscrição. Esta migration habilita o fluxo de opt-in/opt-out exigido
 * pela LGPD e pelas políticas anti-spam da Meta:
 *
 *   - confirm_token   — string aleatória (32 bytes hex = 64 chars) gerada
 *                       no momento do subscribe. Usada nos endpoints
 *                       POST /api/news/whatsapp-confirm e
 *                       POST /api/news/whatsapp-unsubscribe.
 *                       Único globalmente para que um link wa.me identifique
 *                       o subscriber sem expor phone na URL.
 *
 *   - confirmed_at    — timestamp em que o subscriber passou de pending → active.
 *                       Prova de consentimento que pode ser auditada.
 *
 *   - unsubscribed_at — timestamp em que o subscriber pediu opt-out.
 *                       Mantemos a linha para evitar reinscrições não
 *                       solicitadas (ver checagem no service).
 *
 * Todos nullable; registros antigos continuam pending sem token até serem
 * recriados (são poucos — ainda não havia disparo).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "news_whatsapp_subscribers",
      "confirm_token",
      {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment:
          "Token aleatório (32 bytes hex). Usado em /whatsapp-confirm e /whatsapp-unsubscribe.",
      },
    );

    await queryInterface.addColumn(
      "news_whatsapp_subscribers",
      "confirmed_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Quando o subscriber passou de pending para active.",
      },
    );

    await queryInterface.addColumn(
      "news_whatsapp_subscribers",
      "unsubscribed_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Quando o subscriber pediu opt-out (status = unsubscribed).",
      },
    );

    await queryInterface.addIndex(
      "news_whatsapp_subscribers",
      ["confirm_token"],
      {
        name: "uk_news_whatsapp_subscribers_confirm_token",
        unique: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "news_whatsapp_subscribers",
      "uk_news_whatsapp_subscribers_confirm_token",
    );
    await queryInterface.removeColumn("news_whatsapp_subscribers", "confirm_token");
    await queryInterface.removeColumn("news_whatsapp_subscribers", "confirmed_at");
    await queryInterface.removeColumn("news_whatsapp_subscribers", "unsubscribed_at");
  },
};
