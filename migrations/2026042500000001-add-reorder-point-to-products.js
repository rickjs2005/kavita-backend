"use strict";

// A3 (auditoria automação) — alerta de estoque baixo.
//
// Adiciona coluna `reorder_point` em products. Semântica:
//   - NULL  → produto usa o default global (constante DEFAULT_REORDER_POINT
//             em services/produtosAdminService.js, hoje = 5 unidades)
//   - INT   → admin definiu ponto de reposição específico para este produto
//
// Query de "estoque baixo":
//   quantity > 0
//   AND quantity <= COALESCE(reorder_point, ?)  -- ? = default
//   AND is_active = 1
//
// Por que > 0 e is_active=1:
//   - quantity = 0 já é tratado por A1+A2 (auto-desativa)
//   - is_active = 0 significa que o produto não está vendendo, então
//     reposição não é prioridade — admin vê isso pelo filtro de inativos
//
// Migration aditiva — sem backfill (NULL é o default seguro).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "reorder_point", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "reorder_point");
  },
};
