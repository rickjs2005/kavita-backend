"use strict";

// ETAPA 1.2 — Persistir checkout_url pendente na assinatura.
//
// Antes, ao criar cobrança Asaas retornávamos apenas a URL pro
// frontend abrir. Se a corretora fechava a aba antes de pagar,
// perdia o link. Agora persistimos na assinatura:
//   - pending_checkout_url: URL que o gateway devolveu
//   - pending_checkout_at:  quando foi criada (+ timeout de 24h na UI)
//
// Quando o webhook confirma o pagamento (payment_confirmed), zeramos
// ambos os campos. A UI mostra o banner "Pagamento pendente ·
// Reabrir link" enquanto pending_checkout_url != NULL.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "corretora_subscriptions",
      "pending_checkout_url",
      {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
    );
    await queryInterface.addColumn(
      "corretora_subscriptions",
      "pending_checkout_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "corretora_subscriptions",
      "pending_checkout_url",
    );
    await queryInterface.removeColumn(
      "corretora_subscriptions",
      "pending_checkout_at",
    );
  },
};
