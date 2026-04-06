"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE products
        ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
          AFTER sold_count
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX idx_products_is_active ON products (is_active)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX idx_products_is_active ON products
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE products DROP COLUMN is_active
    `);
  },
};
