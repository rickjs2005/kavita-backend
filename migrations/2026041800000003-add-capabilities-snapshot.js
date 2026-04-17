"use strict";

// Fase 5.4 — Versionamento real de capabilities por assinatura.
//
// Até esta migration, capabilities eram lidas via JOIN em plans.
// capabilities no momento da consulta. Consequência: admin editava
// um plano e TODAS as assinaturas existentes passavam a ver a nova
// capability, ainda que tivessem sido contratadas sob uma versão
// diferente. Para transformar o chassi de cobrança recorrente em
// produto sério (contratos estáveis), cada subscription precisa
// "fotografar" as capabilities no momento em que foi criada.
//
// Campos:
//   capabilities_snapshot JSON NULL — snapshot das capabilities no
//     momento da criação da assinatura. NULL para assinaturas antigas
//     (pré-migration) — nesses casos o service faz fallback para
//     plans.capabilities (comportamento legado preservado).
//
// Retrocompat: nenhuma linha é alterada. Subscriptions antigas
// continuam funcionando via JOIN. Só as novas (pós-migration) e as
// que o admin explicitamente "broadcastar" receberão o snapshot.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "corretora_subscriptions",
      "capabilities_snapshot",
      {
        type: Sequelize.JSON,
        allowNull: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "corretora_subscriptions",
      "capabilities_snapshot",
    );
  },
};
