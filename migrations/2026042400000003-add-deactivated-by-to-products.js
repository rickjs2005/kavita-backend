"use strict";

// A1+A2 (auditoria automação) — controle de ORIGEM da desativação.
//
// Antes desta migration, products.is_active era um booleano cego: não
// dava pra saber se 0 veio de admin desativando manualmente OU de
// automação por esgotamento de estoque. Sem isso, reativar
// automaticamente quando estoque volta poderia "zumbificar" produto
// que admin desativou de propósito (qualidade, descontinuação, etc).
//
// Nova coluna `deactivated_by` ENUM('manual','system') NULL:
//   - NULL    → produto está ativo OU foi reativado
//   - 'manual'→ admin desativou conscientemente (proteção contra
//               auto-reactivate por reposição de estoque)
//   - 'system'→ sistema desativou por quantity = 0 (pode reativar
//               quando voltar a ter estoque)
//
// Backfill conservador: todo produto hoje is_active=0 vira
// deactivated_by='manual'. Pior cenário desse default: admin precisa
// reativar manualmente após repor estoque, o que já é exatamente o
// comportamento atual (sem A1+A2). Zero regressão.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "deactivated_by", {
      type: Sequelize.ENUM("manual", "system"),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.sequelize.query(
      `UPDATE products
          SET deactivated_by = 'manual'
        WHERE is_active = 0
          AND deactivated_by IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "deactivated_by");
  },
};
