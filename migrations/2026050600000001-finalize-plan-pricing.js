"use strict";

// Decisao Comercial 2026-05-06 — fechar precos e slugs definitivos:
//
//   FREE        R$   0/mes          self-service
//   PRO         R$  99/mes          checkout Asaas obrigatorio
//   MAX         R$ 349/mes          checkout Asaas obrigatorio
//   ENTERPRISE  contrato comercial  is_public=0 (nao aparece em /pricing,
//                                                 nao pode ser contratado
//                                                 self-service — so admin
//                                                 atribui apos contrato
//                                                 fechado)
//
// Mudancas estruturais:
//   1) Renomeia slug "premium" -> "max" (UI ja usa "max" em varios pontos
//      e o time comercial pediu padronizacao). Zero downtime: subscriptions
//      apontam por plan_id, snapshot guarda capabilities por valor.
//   2) Atualiza precos PRO (14900 -> 9900) e MAX (39900 -> 34900).
//   3) Cria plano "enterprise" se nao existir, com is_public=0.
//   4) Garante max_leads_per_month em FREE (=50) e em PRO/MAX (=null
//      = ilimitado).
//   5) Confirma capabilities canonicas:
//        FREE   regional_highlight=false
//        PRO    regional_highlight=false  (margem boa, mas sem destaque)
//        MAX    regional_highlight=true   (plano de margem; destaque auto)
//        ENT    regional_highlight=true   (white-glove)
//
// Note: precos podem ser editados pelo admin depois; o seed e inicial.

module.exports = {
  async up(queryInterface) {
    const s = queryInterface.sequelize;

    // 1) Rename slug + nome do plano que era "premium"
    await s.query(
      `UPDATE plans
          SET slug = 'max',
              name = 'Max',
              description = 'Para corretoras com volume. Tudo do Pro + destaque regional automatico + equipe ampliada + suporte prioritario.',
              price_cents = 34900,
              capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.regional_highlight', CAST('true' AS JSON),
                '$.advanced_reports',  CAST('true' AS JSON),
                '$.leads_export',      CAST('true' AS JSON),
                '$.create_contract',   CAST('true' AS JSON),
                '$.max_users',         10,
                '$.max_leads_per_month', CAST('null' AS JSON)
              )
        WHERE slug = 'premium'`,
    );

    // Caso a migration rode em ambiente que ja tem slug=max (re-execucao
    // ou banco com seed alternativo), apenas garante valores atualizados.
    await s.query(
      `UPDATE plans
          SET name = 'Max',
              price_cents = 34900,
              capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.regional_highlight', CAST('true' AS JSON),
                '$.advanced_reports',  CAST('true' AS JSON),
                '$.leads_export',      CAST('true' AS JSON),
                '$.create_contract',   CAST('true' AS JSON),
                '$.max_users',         10,
                '$.max_leads_per_month', CAST('null' AS JSON)
              )
        WHERE slug = 'max'`,
    );

    // 2) PRO — preco final + capabilities canonicas (sem regional_highlight)
    await s.query(
      `UPDATE plans
          SET price_cents = 9900,
              description = 'Para corretoras ativas. Equipe + export CSV + relatorios avancados + contratos digitais.',
              capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.regional_highlight', CAST('false' AS JSON),
                '$.advanced_reports',  CAST('true' AS JSON),
                '$.leads_export',      CAST('true' AS JSON),
                '$.create_contract',   CAST('true' AS JSON),
                '$.max_users',         3,
                '$.max_leads_per_month', CAST('null' AS JSON)
              )
        WHERE slug = 'pro'`,
    );

    // 3) FREE — confirma capabilities canonicas (free nao destaca)
    await s.query(
      `UPDATE plans
          SET price_cents = 0,
              capabilities = JSON_SET(
                COALESCE(capabilities, JSON_OBJECT()),
                '$.regional_highlight', CAST('false' AS JSON),
                '$.advanced_reports',  CAST('false' AS JSON),
                '$.leads_export',      CAST('false' AS JSON),
                '$.create_contract',   CAST('false' AS JSON),
                '$.max_users',         1,
                '$.max_leads_per_month', 50
              )
        WHERE slug = 'free'`,
    );

    // 4) ENTERPRISE — cria com is_public=0. Esse plano nao aparece em
    //    /pricing nem no painel da corretora; so admin pode atribuir,
    //    apos contrato comercial fechado fora do app.
    const [existing] = await s.query(
      "SELECT id FROM plans WHERE slug = 'enterprise' LIMIT 1",
    );
    if (!existing.length) {
      await queryInterface.bulkInsert("plans", [
        {
          slug: "enterprise",
          name: "Enterprise",
          description:
            "Contrato comercial com volume dedicado, integracoes sob medida e SLA garantido. Falar com a curadoria Kavita.",
          price_cents: 150000, // R$ 1.500/mes — referencia, ajustado por contrato
          billing_cycle: "monthly",
          capabilities: JSON.stringify({
            max_users: 50,
            max_leads_per_month: null,
            leads_export: true,
            regional_highlight: true,
            advanced_reports: true,
            create_contract: true,
            priority_support: true,
            quick_replies: true,
          }),
          sort_order: 4,
          is_public: 0,
          is_active: 1,
        },
      ]);
    } else {
      // Garante is_public=0 e capabilities consistentes em re-runs.
      await s.query(
        `UPDATE plans
            SET is_public = 0,
                capabilities = JSON_SET(
                  COALESCE(capabilities, JSON_OBJECT()),
                  '$.regional_highlight', CAST('true' AS JSON),
                  '$.advanced_reports',  CAST('true' AS JSON),
                  '$.leads_export',      CAST('true' AS JSON),
                  '$.create_contract',   CAST('true' AS JSON),
                  '$.priority_support',  CAST('true' AS JSON)
                )
          WHERE slug = 'enterprise'`,
      );
    }

    // 5) sort_order canonico: FREE=1, PRO=2, MAX=3, ENT=4
    await s.query("UPDATE plans SET sort_order = 1 WHERE slug = 'free'");
    await s.query("UPDATE plans SET sort_order = 2 WHERE slug = 'pro'");
    await s.query("UPDATE plans SET sort_order = 3 WHERE slug = 'max'");
    await s.query(
      "UPDATE plans SET sort_order = 4 WHERE slug = 'enterprise'",
    );
  },

  async down(queryInterface) {
    const s = queryInterface.sequelize;
    // Volta slug max -> premium e precos antigos. Mantem enterprise no
    // banco (deletar quebraria FK em corretora_subscriptions caso ja
    // tenha sido atribuido em testes — preservacao defensiva).
    await s.query(
      `UPDATE plans
          SET slug = 'premium', name = 'Premium', price_cents = 39900
        WHERE slug = 'max'`,
    );
    await s.query(
      "UPDATE plans SET price_cents = 14900 WHERE slug = 'pro'",
    );
  },
};
