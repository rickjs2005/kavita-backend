"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Drop orphan junction table — not used; products.category_id is the active FK.
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS product_categories");

    // Drop duplicate index on products.category_id
    // idx_products_category and idx_products_category_id both index the same column.
    // Keep idx_products_category_id (created by FK migration), drop the older one.
    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM products WHERE Key_name = 'idx_products_category'"
    );
    if (indexes.length > 0) {
      await queryInterface.sequelize.query(
        "DROP INDEX idx_products_category ON products"
      );
    }
  },

  async down(queryInterface) {
    // Recreate the duplicate index
    await queryInterface.sequelize.query(
      "CREATE INDEX idx_products_category ON products (category_id)"
    );

    // Recreate the orphan table (original structure)
    await queryInterface.sequelize.query(`
      CREATE TABLE product_categories (
        product_id INT NOT NULL AUTO_INCREMENT,
        category_id INT DEFAULT NULL,
        PRIMARY KEY (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  },
};
