"use strict";

// ETAPA 1.4 — cap de leads/mês como capability numérica por plano.
//
// Hoje, o plano FREE recebe leads ilimitados (na prática). Isso trava
// o incentivo de upgrade — corretora "bem servida" no FREE não paga.
//
// A partir desta migration:
//   - FREE (atualizado via seed/admin): max_leads_per_month = 50
//   - PRO/MAX: null = ilimitado
//
// A `capabilities` do plano é coluna JSON. Não precisamos de DDL aqui
// — só um backfill do FREE existente com o novo campo. Admin pode
// editar o valor pela UI PlansAdmin (capability_key já parametrizável
// quando o formulário for expandido).
//
// **Design decisão**: não bloqueamos create de lead (produtor é cliente
// direto do Kavita, não da corretora — bloquear é ruim). Marcamos o
// lead com `is_over_cap=1` e a UI da corretora mostra banner com CTA
// upgrade. Leads over-cap ficam visíveis só após upgrade. Elegante.

module.exports = {
  async up(queryInterface) {
    // Backfill FREE com max_leads_per_month = 50
    await queryInterface.sequelize.query(
      `UPDATE plans
          SET capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.max_leads_per_month', 50
              )
        WHERE slug = 'free'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE plans
          SET capabilities = JSON_REMOVE(capabilities, '$.max_leads_per_month')
        WHERE slug = 'free'
          AND JSON_CONTAINS_PATH(capabilities, 'one', '$.max_leads_per_month')`,
    );
  },
};
