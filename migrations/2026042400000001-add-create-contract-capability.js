"use strict";

// G1 (auditoria automação) — nova capability `create_contract` nos planos
// do SaaS de Corretoras de Café.
//
// Regra comercial (decisão do usuário em 2026-04-24):
//   - FREE:    create_contract = false → não pode gerar nem enviar contrato novo
//   - PRO:     create_contract = true  → pode
//   - PREMIUM: create_contract = true  → pode
//
// IMPORTANTE: cancelar contrato NÃO é bloqueado por esta capability
// (decisão 2a) — cancelamento é humano e deve ser sempre possível.
// Visualização/listagem também permanece livre.
//
// Backfill em 2 camadas porque capabilities vivem em 2 lugares:
//   1) `plans.capabilities` — catálogo vigente (editável pelo admin)
//   2) `corretora_subscriptions.capabilities_snapshot` — snapshot congelado
//      no momento da assinatura (Fase 5.4). Se não adicionarmos a key aqui,
//      corretoras PRO/PREMIUM com subscription existente seriam bloqueadas
//      porque o `hasCapability` retorna false para key ausente.
//
// JSON_SET é idempotente: roda 2x não polui.

module.exports = {
  async up(queryInterface) {
    // 1) Atualiza o catálogo de planos (live capabilities)
    await queryInterface.sequelize.query(
      `UPDATE plans
          SET capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.create_contract', false
              )
        WHERE slug = 'free'`,
    );
    await queryInterface.sequelize.query(
      `UPDATE plans
          SET capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.create_contract', true
              )
        WHERE slug IN ('pro', 'premium')`,
    );

    // 2) Backfill em subscriptions ATIVAS — assinaturas canceladas ou
    // expiradas não precisam (nem devem) ser tocadas; o snapshot
    // delas é histórico imutável para auditoria/cobrança.
    await queryInterface.sequelize.query(
      `UPDATE corretora_subscriptions cs
          JOIN plans p ON p.id = cs.plan_id
          SET cs.capabilities_snapshot = JSON_SET(
                COALESCE(cs.capabilities_snapshot, JSON_OBJECT()),
                '$.create_contract',
                CASE WHEN p.slug IN ('pro', 'premium') THEN CAST('true' AS JSON)
                     ELSE CAST('false' AS JSON)
                END
              )
        WHERE cs.status IN ('active', 'trialing')`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE plans
          SET capabilities = JSON_REMOVE(capabilities, '$.create_contract')
        WHERE JSON_CONTAINS_PATH(capabilities, 'one', '$.create_contract')`,
    );
    await queryInterface.sequelize.query(
      `UPDATE corretora_subscriptions
          SET capabilities_snapshot = JSON_REMOVE(capabilities_snapshot, '$.create_contract')
        WHERE JSON_CONTAINS_PATH(capabilities_snapshot, 'one', '$.create_contract')`,
    );
  },
};
