"use strict";

// Lote 2 — Estrutura de monetização.
//
// Preparação completa de billing sem ligar cobrança real ainda.
// Quando o momento comercial chegar, o adapter de Mercado Pago (ou
// Stripe) preenche subscription_provider_id/provider_status sem
// mudanças estruturais.
//
// Decisões de design:
//
//   - `plans` com capabilities JSON livre: cada feature paga
//     (multi-usuário, export, destaque regional, relatórios) é
//     representada como chave. Evita múltiplas migrations ao
//     adicionar feature nova.
//
//   - `corretora_subscriptions` — histórico versus status atual.
//     Só pode haver 1 subscription active por corretora (unique
//     index parcial). Trocas de plano criam novo registro e
//     cancelam o anterior.
//
//   - `corretora_city_promotions` — destaque pago por cidade.
//     Independente de subscription (pode ser add-on). Active/Expired
//     controlado por data + flag.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── plans ─────────────────────────────────────────────────────
    await queryInterface.createTable("plans", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Valor em centavos (BRL). 0 = plano gratuito.
      price_cents: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      billing_cycle: {
        type: Sequelize.ENUM("monthly", "yearly"),
        allowNull: false,
        defaultValue: "monthly",
      },
      // Capabilities — JSON com chaves booleanas e limites:
      //   {
      //     "max_users": 5,
      //     "leads_export": true,
      //     "regional_highlight": true,
      //     "advanced_reports": false
      //   }
      capabilities: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_public: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex("plans", ["slug"], {
      name: "uq_plans_slug",
      unique: true,
    });

    // Seed inicial — Free + Pro + Premium. Pode ser reajustado no
    // admin depois.
    await queryInterface.bulkInsert("plans", [
      {
        slug: "free",
        name: "Free",
        description:
          "Para começar. Gratuito para sempre. Perfil público no Mercado do Café + leads por email.",
        price_cents: 0,
        billing_cycle: "monthly",
        capabilities: JSON.stringify({
          max_users: 1,
          leads_export: false,
          regional_highlight: false,
          advanced_reports: false,
        }),
        sort_order: 1,
        is_public: 1,
        is_active: 1,
      },
      {
        slug: "pro",
        name: "Pro",
        description:
          "Para corretoras ativas. Equipe + export CSV + painel regional completo.",
        price_cents: 14900, // R$ 149/mês — valor sugerido, ajustável no admin
        billing_cycle: "monthly",
        capabilities: JSON.stringify({
          max_users: 3,
          leads_export: true,
          regional_highlight: false,
          advanced_reports: true,
        }),
        sort_order: 2,
        is_public: 1,
        is_active: 1,
      },
      {
        slug: "premium",
        name: "Premium",
        description:
          "Para corretoras com volume. Tudo do Pro + destaque regional + equipe ilimitada + suporte prioritário.",
        price_cents: 39900, // R$ 399/mês
        billing_cycle: "monthly",
        capabilities: JSON.stringify({
          max_users: 10,
          leads_export: true,
          regional_highlight: true,
          advanced_reports: true,
        }),
        sort_order: 3,
        is_public: 1,
        is_active: 1,
      },
    ]);

    // ─── corretora_subscriptions ───────────────────────────────────
    await queryInterface.createTable("corretora_subscriptions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      plan_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      status: {
        type: Sequelize.ENUM(
          "active",     // plano vigente
          "trialing",   // trial ativo
          "past_due",   // inadimplente
          "canceled",   // cancelado
          "expired",    // expirou sem renovar
        ),
        allowNull: false,
        defaultValue: "active",
      },
      // Período de cobrança atual
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      canceled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // Integração com provider de pagamento (vazio até ligar Mercado Pago)
      provider: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      provider_subscription_id: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      provider_status: {
        type: Sequelize.STRING(60),
        allowNull: true,
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex(
      "corretora_subscriptions",
      ["corretora_id", "status"],
      { name: "idx_subscriptions_corretora_status" },
    );
    await queryInterface.addIndex(
      "corretora_subscriptions",
      ["current_period_end"],
      { name: "idx_subscriptions_period_end" },
    );

    // ─── corretora_city_promotions ─────────────────────────────────
    // Destaque pago por cidade. Independente de subscription — pode
    // ser add-on.
    await queryInterface.createTable("corretora_city_promotions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Cidade alvo (usa mesmo catálogo do frontend/regioes.ts — o
      // valor aqui é o nome da cidade em formato humano, ex: "Manhuaçu").
      city: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      starts_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      ends_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
      },
      price_cents: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      provider: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      provider_payment_id: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex(
      "corretora_city_promotions",
      ["city", "is_active", "ends_at"],
      { name: "idx_city_promotions_city_active" },
    );
    await queryInterface.addIndex(
      "corretora_city_promotions",
      ["corretora_id"],
      { name: "idx_city_promotions_corretora" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_city_promotions");
    await queryInterface.dropTable("corretora_subscriptions");
    await queryInterface.dropTable("plans");
  },
};
