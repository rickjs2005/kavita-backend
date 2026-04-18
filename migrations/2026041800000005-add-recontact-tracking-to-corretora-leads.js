"use strict";

// Fase 2 dedupe — quando o produtor re-submete o form para a mesma
// corretora em < 24h, não criamos lead novo (ruído no CRM). Em vez
// disso, incrementamos recontact_count e atualizamos last_recontact_at
// no lead existente. A corretora recebe notificação informando que o
// produtor voltou a chamar — sinal forte de interesse, não spam.
//
// Sem backfill: leads existentes ficam recontact_count=0 por default.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "recontact_count", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretora_leads", "last_recontact_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_leads", "recontact_count");
    await queryInterface.removeColumn("corretora_leads", "last_recontact_at");
  },
};
