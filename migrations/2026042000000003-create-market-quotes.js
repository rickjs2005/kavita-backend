"use strict";

// Fase 10.4 — snapshots de cotação persistidos.
//
// Um snapshot por (source, symbol) é o "estado atual" — upsert por
// PRIMARY KEY composta. Histórico não é necessário para o ticker
// (mantemos últimas 30 versões em outra migração se a Kavita News
// pedir gráfico intraday depois). Aqui o foco é:
//
//   - uma linha única por indicador → frontend lê em O(1)
//   - `quoted_at` (da fonte) ≠ `fetched_at` (do nosso cron); se a
//     fonte não publicou hoje, quoted_at fica com a data válida
//     anterior e o service marca como "stale" quando > 48h
//   - price_brl_cents + price_usd_cents em campos separados — cada
//     indicador publica na moeda nativa (CEPEA = R$, ICE = US$)
//
// Unit conventions:
//   - CEPEA arábica: R$/saca 60 kg → price_brl_cents (ex.: R$ 1.800,72 = 180072)
//   - ICE "C" Nova York: US$/lb × 100 = cents/lb → price_usd_cents
//     (ex.: $3.24/lb = 324)
//
// source + symbol formam a chave natural. Nunca criamos IDs
// sintéticos porque não há referência externa apontando para este
// registro — ele é um cache de última cotação.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("market_quotes", {
      source: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      symbol: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      price_brl_cents: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      price_usd_cents: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      variation_pct: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      },
      quoted_at: {
        // Data/hora em que a fonte reportou este preço (pode ser
        // D-1 se hoje é não útil).
        type: Sequelize.DATE,
        allowNull: false,
      },
      fetched_at: {
        // Quando nosso cron bateu na fonte com sucesso.
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      source_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      meta: {
        // JSON livre para metadados específicos do provider
        // (ex.: CEPEA tem id_cepea; ICE tem contract_month).
        type: Sequelize.JSON,
        allowNull: true,
      },
    });

    await queryInterface.addConstraint("market_quotes", {
      fields: ["source", "symbol"],
      type: "primary key",
      name: "pk_market_quotes",
    });

    await queryInterface.addIndex("market_quotes", ["quoted_at"], {
      name: "idx_market_quotes_quoted_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("market_quotes");
  },
};
