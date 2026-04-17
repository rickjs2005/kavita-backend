"use strict";

// Sprint 3 — Estabilidade de URLs indexadas.
//
// Quando uma corretora é renomeada, o service gera um novo slug via
// uniqueSlug() e sobrescreve a coluna slug. URLs antigas indexadas no
// Google passam a retornar 404. Esta tabela guarda o mapeamento para
// redirect 301 na camada pública.
//
// Esquema simples: (old_slug UNIQUE, corretora_id, retired_at). O slug
// antigo é a chave natural de lookup. Se mesmo slug voltar a ser usado
// no futuro por outra corretora (improvável mas possível), o UNIQUE
// impede e força o uniqueSlug() a adicionar sufixo.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_slug_history", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      old_slug: {
        type: Sequelize.STRING(220),
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      retired_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Lookup principal: slug desconhecido → corretora_id + destino.
    await queryInterface.addIndex("corretora_slug_history", ["old_slug"], {
      name: "uq_slug_history_old_slug",
      unique: true,
    });
    await queryInterface.addIndex("corretora_slug_history", ["corretora_id"], {
      name: "idx_slug_history_corretora",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_slug_history");
  },
};
