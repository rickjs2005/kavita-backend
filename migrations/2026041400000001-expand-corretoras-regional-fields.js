"use strict";

// Sprint 2 — Regionalização profunda do perfil da corretora.
//
// Adiciona campos que permitem a corretora se apresentar corretamente
// para produtores da Zona da Mata Mineira:
//
//   cidades_atendidas   — JSON array de slugs de cidades onde atua
//                         (ex: ["manhuacu", "manhumirim", "lajinha"])
//   tipos_cafe          — JSON array de tipos com que trabalha
//                         (ex: ["arabica_comum", "arabica_especial"])
//   perfil_compra       — "compra", "venda", "ambos" (o que a corretora faz)
//   horario_atendimento — texto livre (ex: "Seg-Sex 7h-17h")
//   anos_atuacao        — inteiro (tempo de mercado na região)
//   foto_responsavel_path — caminho da foto do responsável (opcional)
//
// Todos opcionais para não quebrar corretoras já cadastradas. JSON é
// usado (em vez de tabelas relacionais) porque listas são pequenas e
// estáticas — simplifica API e reads não precisam de join.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretoras", "cidades_atendidas", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "tipos_cafe", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "perfil_compra", {
      type: Sequelize.ENUM("compra", "venda", "ambos"),
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "horario_atendimento", {
      type: Sequelize.STRING(120),
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "anos_atuacao", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "foto_responsavel_path", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretoras", "cidades_atendidas");
    await queryInterface.removeColumn("corretoras", "tipos_cafe");
    await queryInterface.removeColumn("corretoras", "perfil_compra");
    await queryInterface.removeColumn("corretoras", "horario_atendimento");
    await queryInterface.removeColumn("corretoras", "anos_atuacao");
    await queryInterface.removeColumn("corretoras", "foto_responsavel_path");
  },
};
