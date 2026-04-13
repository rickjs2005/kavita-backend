"use strict";

// Adiciona controle de uso por usuário e restrições por categoria/produto
// aos cupons de desconto.
//
// Mudanças:
//   1. cupons.max_usos_por_usuario — limite de usos por cliente (NULL = ilimitado)
//   2. cupom_usos — registra cada uso de cupom por usuário/pedido
//   3. cupom_restricoes — restringe cupom a categorias ou produtos específicos
//
// Cupons existentes ficam com max_usos_por_usuario = NULL (sem limite por
// usuário, comportamento idêntico ao anterior). Tabelas novas nascem vazias
// — cupons sem restrições continuam aceitando qualquer produto.

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. Nova coluna em cupons
      await queryInterface.addColumn(
        "cupons",
        "max_usos_por_usuario",
        {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: null,
          after: "max_usos",
        },
        { transaction: t },
      );

      // 2. Tabela de rastreio de uso por usuário
      await queryInterface.sequelize.query(
        `CREATE TABLE \`cupom_usos\` (
          \`id\` int unsigned NOT NULL AUTO_INCREMENT,
          \`cupom_id\` int unsigned NOT NULL,
          \`usuario_id\` int unsigned NOT NULL,
          \`pedido_id\` int unsigned NOT NULL,
          \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_cupom_usos_cupom_usuario\` (\`cupom_id\`, \`usuario_id\`),
          KEY \`idx_cupom_usos_pedido\` (\`pedido_id\`),
          CONSTRAINT \`fk_cupom_usos_cupom\` FOREIGN KEY (\`cupom_id\`) REFERENCES \`cupons\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_cupom_usos_usuario\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_cupom_usos_pedido\` FOREIGN KEY (\`pedido_id\`) REFERENCES \`pedidos\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`,
        { transaction: t },
      );

      // 3. Tabela de restrições por categoria/produto
      await queryInterface.sequelize.query(
        `CREATE TABLE \`cupom_restricoes\` (
          \`id\` int unsigned NOT NULL AUTO_INCREMENT,
          \`cupom_id\` int unsigned NOT NULL,
          \`tipo\` enum('categoria','produto') NOT NULL,
          \`target_id\` int unsigned NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_cupom_restricoes_cupom\` (\`cupom_id\`),
          UNIQUE KEY \`uq_cupom_restricao\` (\`cupom_id\`, \`tipo\`, \`target_id\`),
          CONSTRAINT \`fk_cupom_restricoes_cupom\` FOREIGN KEY (\`cupom_id\`) REFERENCES \`cupons\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`,
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `cupom_restricoes`;", { transaction: t });
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS `cupom_usos`;", { transaction: t });
      await queryInterface.removeColumn("cupons", "max_usos_por_usuario", { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
