"use strict";

// Expande o laudo de classificação do café no lead.
//
// A migration anterior (2026041600000001) criou 3 campos básicos:
//   bebida_classificacao, pontuacao_sca, preco_referencia_saca
//
// Esta migration adiciona os campos que faltam para um laudo
// operacional completo de corretora da Zona da Mata:
//
//   Qualidade sensorial:
//     umidade_pct           — % de umidade do grão (10.0–14.0 ideal)
//     peneira               — tamanho do grão (ex: 17/18, 15/16)
//     catacao_defeitos       — nível de defeitos por amostra (texto livre)
//     aspecto_lote           — aparência visual (verde-azulado, claro, etc.)
//     obs_sensoriais         — notas de prova livre (chocolate, frutado...)
//
//   Avaliação comercial:
//     obs_comerciais         — anotações do corretor sobre a negociação
//     mercado_indicado       — destino sugerido (exportação, interno, etc.)
//     aptidao_oferta         — lote está pronto para ofertar? (sim/não/parcial)
//     prioridade_comercial   — urgência comercial (alta/média/baixa)
//
//   Origem detalhada:
//     altitude_origem        — metros do local do café (derivado ou informado)
//     variedade_cultivar     — ex: Catuaí, Mundo Novo, Catucaí
//
// Todos opcionais (lead pode existir sem laudo).

module.exports = {
  async up(queryInterface, Sequelize) {
    // Qualidade sensorial
    await queryInterface.addColumn("corretora_leads", "umidade_pct", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "peneira", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "catacao_defeitos", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "aspecto_lote", {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "obs_sensoriais", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Avaliação comercial
    await queryInterface.addColumn("corretora_leads", "obs_comerciais", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "mercado_indicado", {
      type: Sequelize.ENUM(
        "exportacao",
        "mercado_interno",
        "cafeteria",
        "commodity",
        "indefinido",
      ),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "aptidao_oferta", {
      type: Sequelize.ENUM("sim", "nao", "parcial"),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "prioridade_comercial", {
      type: Sequelize.ENUM("alta", "media", "baixa"),
      allowNull: true,
    });

    // Origem detalhada
    await queryInterface.addColumn("corretora_leads", "altitude_origem", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "variedade_cultivar", {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const cols = [
      "variedade_cultivar",
      "altitude_origem",
      "prioridade_comercial",
      "aptidao_oferta",
      "mercado_indicado",
      "obs_comerciais",
      "obs_sensoriais",
      "aspecto_lote",
      "catacao_defeitos",
      "peneira",
      "umidade_pct",
    ];
    for (const col of cols) {
      await queryInterface.removeColumn("corretora_leads", col);
    }
  },
};
