"use strict";

// Fase 10.3 — campos de privacidade na conta do produtor.
//
//   pending_deletion_at → quando o titular pediu exclusão (usado
//     para bloquear novo login e mostrar UI de "conta será
//     removida em X dias"). Quando a exclusão é executada/cancelada,
//     voltamos a NULL.
//
//   anonymized_at → marca que os campos PII foram substituídos por
//     placeholders. Após esta data a conta **não** pode mais ser
//     usada; serve só como âncora histórica para audit e pedidos
//     fiscais vinculados.
//
//   privacy_policy_version / privacy_policy_accepted_at → versão
//     da política aceita pelo produtor. Quando atualizarmos o texto
//     de `/privacidade`, bumpamos o versionamento e pedimos aceite
//     novamente no próximo login.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("producer_accounts", "pending_deletion_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("producer_accounts", "anonymized_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn(
      "producer_accounts",
      "privacy_policy_version",
      {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
    );
    await queryInterface.addColumn(
      "producer_accounts",
      "privacy_policy_accepted_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "producer_accounts",
      "privacy_policy_accepted_at",
    );
    await queryInterface.removeColumn(
      "producer_accounts",
      "privacy_policy_version",
    );
    await queryInterface.removeColumn("producer_accounts", "anonymized_at");
    await queryInterface.removeColumn("producer_accounts", "pending_deletion_at");
  },
};
