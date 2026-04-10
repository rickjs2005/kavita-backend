"use strict";

// Adiciona coluna `scope` em password_reset_tokens para suportar escopos
// diferentes de usuário (ex: corretora_users na Fase 2 do Mercado do Café).
//
// user_id era ambíguo — id 5 de `usuarios` e id 5 de `corretora_users`
// apontariam para o mesmo token. A coluna scope cria isolamento lógico
// sem precisar de tabela separada.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("password_reset_tokens", "scope", {
      type: Sequelize.ENUM("user", "corretora_user"),
      allowNull: false,
      defaultValue: "user",
      after: "user_id",
    });

    // Índice composto para lookups rápidos por escopo.
    await queryInterface.addIndex(
      "password_reset_tokens",
      ["scope", "user_id", "expires_at"],
      { name: "idx_prt_scope_user_expires" }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "password_reset_tokens",
      "idx_prt_scope_user_expires"
    );
    await queryInterface.removeColumn("password_reset_tokens", "scope");
  },
};
