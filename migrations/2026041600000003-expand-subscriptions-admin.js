"use strict";

// Expande corretora_subscriptions para controle operacional admin.
//
// Campos novos:
//   payment_method      — como a corretora paga (manual/pix/boleto/cartao)
//   monthly_price_cents — valor mensal combinado (pode diferir do price do plan)
//   trial_ends_at       — fim do período de teste (3 meses por default)
//   notes               — observação interna do admin sobre a assinatura

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_subscriptions", "payment_method", {
      type: Sequelize.ENUM("manual", "pix", "boleto", "cartao"),
      allowNull: true,
      defaultValue: "manual",
    });

    await queryInterface.addColumn("corretora_subscriptions", "monthly_price_cents", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_subscriptions", "trial_ends_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_subscriptions", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_subscriptions", "notes");
    await queryInterface.removeColumn("corretora_subscriptions", "trial_ends_at");
    await queryInterface.removeColumn("corretora_subscriptions", "monthly_price_cents");
    await queryInterface.removeColumn("corretora_subscriptions", "payment_method");
  },
};
