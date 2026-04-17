"use strict";

// Sprint 8 — Resposta pública da corretora em reviews.
//
// Produtor publica review → admin aprova → corretora escreve resposta
// pública (opcional, até 1000 chars). A resposta aparece no detalhe
// público logo abaixo da review original. Apenas reviews approved podem
// receber reply (guard no service). Reply não afeta rating nem status
// da review; é texto complementar.
//
// Campos:
//   corretora_reply     — texto livre (até 1000 chars validados na Zod)
//   replied_at          — timestamp do último reply (edição sobrescreve)
//   replied_by          — corretora_user.id que escreveu (para auditoria
//                         interna do tenant; no público só vemos o texto)

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_reviews", "corretora_reply", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_reviews", "replied_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_reviews", "replied_by", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_reviews", "replied_by");
    await queryInterface.removeColumn("corretora_reviews", "replied_at");
    await queryInterface.removeColumn("corretora_reviews", "corretora_reply");
  },
};
