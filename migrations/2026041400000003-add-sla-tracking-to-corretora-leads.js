"use strict";

// Sprint 3 — SLA tracking para leads de corretora.
//
// Em vez de uma tabela separada de eventos (que exigiria joins em
// todo dashboard), armazenamos os timestamps direto no lead. Motivo:
//
//   - O primeiro contato da corretora é único por lead (não histórico)
//   - Permite queries simples: AVG(first_response_seconds) WHERE ...
//   - Índice em (corretora_id, first_response_seconds) dá dashboards
//     rápidos sem stored procedures.
//
// Campos:
//   first_response_at       — timestamp da 1ª mudança de status (new → *)
//   first_response_seconds  — diferença entre created_at e first_response_at
//                             (em segundos; NULL se ainda não respondido)
//
// A gravação acontece no service corretoraLeadsService.updateLead,
// com guard: só grava se first_response_at for NULL. Evita
// sobrescrever SLA real em correções de status posteriores.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "first_response_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn(
      "corretora_leads",
      "first_response_seconds",
      {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
    );

    // Índice composto para queries agregadas do admin
    // (tempo médio por corretora, leads sem resposta por período, etc).
    await queryInterface.addIndex(
      "corretora_leads",
      ["corretora_id", "first_response_at"],
      { name: "idx_leads_corretora_response" },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_leads_corretora_response",
    );
    await queryInterface.removeColumn(
      "corretora_leads",
      "first_response_seconds",
    );
    await queryInterface.removeColumn("corretora_leads", "first_response_at");
  },
};
