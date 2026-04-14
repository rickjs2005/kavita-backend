"use strict";

// Sprint 2 — Qualificação de lead para o contexto regional.
//
// Adiciona campos que a corretora precisa para priorizar atendimento
// e atender melhor produtores da Zona da Mata:
//
//   objetivo        — "vender" | "comprar" | "cotacao" | "outro"
//                     Intenção principal do contato.
//   tipo_cafe       — "arabica_comum" | "arabica_especial" | "natural"
//                     | "cereja_descascado" | "ainda_nao_sei"
//   volume_range    — "ate_50" | "50_200" | "200_500" | "500_mais"
//                     Volume estimado em sacas de 60kg.
//   canal_preferido — "whatsapp" | "ligacao" | "email"
//                     Como o produtor quer ser contatado de volta.
//
// Nota: `cidade` e `telefone` já existiam, mantidos como estão.
// `email` era implícito pela origem; mantemos flexível.
//
// Todos opcionais para compatibilidade com leads antigos já capturados
// via formulário genérico.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "objetivo", {
      type: Sequelize.ENUM("vender", "comprar", "cotacao", "outro"),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "tipo_cafe", {
      type: Sequelize.ENUM(
        "arabica_comum",
        "arabica_especial",
        "natural",
        "cereja_descascado",
        "ainda_nao_sei",
      ),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "volume_range", {
      type: Sequelize.ENUM("ate_50", "50_200", "200_500", "500_mais"),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "canal_preferido", {
      type: Sequelize.ENUM("whatsapp", "ligacao", "email"),
      allowNull: true,
    });

    // Índice útil para filtros/relatórios do painel
    await queryInterface.addIndex(
      "corretora_leads",
      ["corretora_id", "volume_range"],
      { name: "idx_leads_corretora_volume" },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_leads_corretora_volume",
    );
    await queryInterface.removeColumn("corretora_leads", "objetivo");
    await queryInterface.removeColumn("corretora_leads", "tipo_cafe");
    await queryInterface.removeColumn("corretora_leads", "volume_range");
    await queryInterface.removeColumn("corretora_leads", "canal_preferido");
  },
};
