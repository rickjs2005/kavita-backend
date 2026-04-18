"use strict";

// ETAPA 3.2 — opt-in SMS do produtor rural.
//
// Muitos produtores da Zona da Mata (50+ anos) preferem SMS a
// WhatsApp porque não mexem bem com apps. Permitimos opt-in
// explícito no form público; backend dispara SMS quando a
// corretora "vê" o lead (status: new → contacted).
//
// allowNull=false + default 0 — produtor existente antes desta
// migration segue sem SMS (comportamento atual preservado).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "sms_optin", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretora_leads", "sms_sent_contacted_at", {
      // Carimbo de quando já mandamos o SMS "corretora respondeu" pro
      // lead. Evita duplicidade quando a corretora oscila status.
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_leads", "sms_optin");
    await queryInterface.removeColumn("corretora_leads", "sms_sent_contacted_at");
  },
};
