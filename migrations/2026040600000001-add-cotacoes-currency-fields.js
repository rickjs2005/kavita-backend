"use strict";

/**
 * Migration: add currency conversion traceability fields to news_cotacoes.
 *
 * The quotations module now converts all prices to BRL before persisting.
 * These new columns store the original provider value and the exchange rate
 * used, so the conversion is fully auditable.
 *
 * Changes:
 * 1. Add original_price DECIMAL(12,4) NULL — raw price from external provider
 * 2. Add original_currency VARCHAR(10) NULL — currency of original_price (e.g. "USD", "BRL")
 * 3. Add exchange_rate DECIMAL(12,6) NULL — USD/BRL rate used for conversion (null if already BRL)
 *
 * All columns are nullable for backward compatibility with existing rows.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE news_cotacoes
        ADD COLUMN original_price DECIMAL(12,4) NULL AFTER price,
        ADD COLUMN original_currency VARCHAR(10) NULL AFTER original_price,
        ADD COLUMN exchange_rate DECIMAL(12,6) NULL AFTER original_currency
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE news_cotacoes
        DROP COLUMN IF EXISTS exchange_rate,
        DROP COLUMN IF EXISTS original_currency,
        DROP COLUMN IF EXISTS original_price
    `);
  },
};
