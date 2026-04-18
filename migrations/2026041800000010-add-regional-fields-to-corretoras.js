"use strict";

// Fase 8 — campos regionais adicionais da corretora.
//
// Completa o perfil pra contemplar decisões que o produtor da Zona
// da Mata toma na hora de escolher com quem vender:
//   - endereco_textual: endereço humano (não CEP) — "Av. Getúlio
//     Vargas 100, Centro" — alimenta o link Google Maps da ficha
//   - compra_cafe_especial: aceita arábica especial (SCA 80+)
//   - volume_minimo_sacas: piso mínimo que atende (evita
//     fricção de "não compra lote pequeno")
//   - faz_retirada_amostra: vai até o produtor buscar
//   - trabalha_exportacao: compra para exportação
//   - trabalha_cooperativas: compra/repasse via cooperativa
//
// Todos allowNull=true (registros antigos seguem válidos) exceto os
// booleanos com default=0.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretoras", "endereco_textual", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("corretoras", "compra_cafe_especial", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretoras", "volume_minimo_sacas", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn("corretoras", "faz_retirada_amostra", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretoras", "trabalha_exportacao", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("corretoras", "trabalha_cooperativas", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretoras", "endereco_textual");
    await queryInterface.removeColumn("corretoras", "compra_cafe_especial");
    await queryInterface.removeColumn("corretoras", "volume_minimo_sacas");
    await queryInterface.removeColumn("corretoras", "faz_retirada_amostra");
    await queryInterface.removeColumn("corretoras", "trabalha_exportacao");
    await queryInterface.removeColumn("corretoras", "trabalha_cooperativas");
  },
};
