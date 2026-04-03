"use strict";

/**
 * Migration: fix missing ON DELETE behaviors and add performance indexes.
 *
 * Changes:
 * 1. carrinhos_abandonados.usuario_id → ON DELETE CASCADE
 * 2. carrinhos_abandonados.carrinho_id → ON DELETE CASCADE
 * 3. comunicacoes_enviadas.usuario_id → ON DELETE SET NULL
 * 4. comunicacoes_enviadas.pedido_id → ON DELETE SET NULL
 * 5. Add index on pedidos.cupom_codigo (used in checkout deduplication GROUP BY)
 * 6. Add index on carrinhos_abandonados.usuario_id (used in notification queries)
 *
 * All changes are backward-compatible and do not alter data.
 */

module.exports = {
  async up(queryInterface) {
    // --- 1 & 2: carrinhos_abandonados FK fixes ---
    // Drop existing FKs and recreate with ON DELETE CASCADE
    await queryInterface.sequelize.query(`
      ALTER TABLE carrinhos_abandonados
        DROP FOREIGN KEY fk_carr_aband_user
    `).catch(() => { /* FK may not exist by that name */ });

    await queryInterface.sequelize.query(`
      ALTER TABLE carrinhos_abandonados
        DROP FOREIGN KEY fk_carr_aband_cart
    `).catch(() => { /* FK may not exist by that name */ });

    await queryInterface.sequelize.query(`
      ALTER TABLE carrinhos_abandonados
        ADD CONSTRAINT fk_carr_aband_user
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        ADD CONSTRAINT fk_carr_aband_cart
          FOREIGN KEY (carrinho_id) REFERENCES carrinhos(id) ON DELETE CASCADE
    `);

    // --- 3 & 4: comunicacoes_enviadas FK fixes ---
    // Make nullable first (if not already), then add SET NULL FKs
    await queryInterface.sequelize.query(`
      ALTER TABLE comunicacoes_enviadas
        DROP FOREIGN KEY fk_comunicacoes_usuario
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE comunicacoes_enviadas
        DROP FOREIGN KEY fk_comunicacoes_pedido
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE comunicacoes_enviadas
        MODIFY COLUMN usuario_id int DEFAULT NULL,
        MODIFY COLUMN pedido_id int DEFAULT NULL,
        ADD CONSTRAINT fk_comunicacoes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
        ADD CONSTRAINT fk_comunicacoes_pedido
          FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
    `);

    // --- 5: Index on pedidos.cupom_codigo ---
    await queryInterface.addIndex("pedidos", ["cupom_codigo"], {
      name: "idx_pedidos_cupom_codigo",
    }).catch(() => { /* Index may already exist */ });

    // --- 6: Index on carrinhos_abandonados.usuario_id ---
    await queryInterface.addIndex("carrinhos_abandonados", ["usuario_id"], {
      name: "idx_carr_aband_usuario_id",
    }).catch(() => {});
  },

  async down(queryInterface) {
    // Revert indexes
    await queryInterface.removeIndex("pedidos", "idx_pedidos_cupom_codigo").catch(() => {});
    await queryInterface.removeIndex("carrinhos_abandonados", "idx_carr_aband_usuario_id").catch(() => {});

    // Revert FK changes (back to no ON DELETE behavior)
    await queryInterface.sequelize.query(`
      ALTER TABLE carrinhos_abandonados
        DROP FOREIGN KEY fk_carr_aband_user,
        DROP FOREIGN KEY fk_carr_aband_cart
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE carrinhos_abandonados
        ADD CONSTRAINT fk_carr_aband_user
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        ADD CONSTRAINT fk_carr_aband_cart
          FOREIGN KEY (carrinho_id) REFERENCES carrinhos(id)
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE comunicacoes_enviadas
        DROP FOREIGN KEY fk_comunicacoes_usuario,
        DROP FOREIGN KEY fk_comunicacoes_pedido
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE comunicacoes_enviadas
        ADD CONSTRAINT fk_comunicacoes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        ADD CONSTRAINT fk_comunicacoes_pedido
          FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    `).catch(() => {});
  },
};
