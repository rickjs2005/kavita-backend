"use strict";

// Fase 3 — campos de proposta/compra + próxima ação. Fechamento do
// ciclo comercial: a corretora registra preço proposto, preço fechado,
// data de compra e destino do café, além de uma próxima ação agendada
// para a corretora não esquecer o produtor.
//
// Tudo allowNull=true: a maioria dos leads nunca chega em proposta
// (é perdido antes). Preenchimento é incremental e opcional.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "preco_proposto", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "preco_fechado", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "data_compra", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "destino_venda", {
      type: Sequelize.ENUM(
        "mercado_interno",
        "exportacao",
        "cooperativa",
        "revenda",
        "outro",
      ),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "next_action_text", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "next_action_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // Index pra dashboard "leads com próxima ação vencida"
    await queryInterface.addIndex(
      "corretora_leads",
      ["corretora_id", "next_action_at"],
      { name: "idx_corretora_leads_next_action" },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_corretora_leads_next_action",
    );
    await queryInterface.removeColumn("corretora_leads", "preco_proposto");
    await queryInterface.removeColumn("corretora_leads", "preco_fechado");
    await queryInterface.removeColumn("corretora_leads", "data_compra");
    await queryInterface.removeColumn("corretora_leads", "destino_venda");
    await queryInterface.removeColumn("corretora_leads", "next_action_text");
    await queryInterface.removeColumn("corretora_leads", "next_action_at");
  },
};
