"use strict";

// CRM conversacional premium — adiciona dois campos que sao base para
// personalidade da corretora + memoria de conversa do lead.
//
//   1) corretoras.communication_style
//      ENUM('tradicional','premium','tecnico','agressivo','regional','corporativo')
//      Default 'tradicional' (mantém comportamento atual).
//      Define o tom das mensagens automatizadas que a corretora envia.
//
//   2) corretora_leads.conversational_state
//      JSON nullable. Guarda historico curto da conversa para evitar
//      pedir 2x a mesma informacao e para escolher proximo passo
//      ("ja perguntei sobre amostra? ja' sei o volume?").
//
//      Estrutura tipica:
//        {
//          "stage": "primeiro_contato" | "interesse" | "amostra"
//                 | "negociacao" | "fechamento" | "logistica",
//          "knownFacts": { volume, tipoCafe, amostraPrometida, ... },
//          "askedAbout": ["volume", "amostra"],
//          "outboundCount": 2,
//          "inboundCount": 0,
//          "lastOutboundAt": "...",
//          "lastInboundAt": null,
//          "lastIntent": "corretora_primeiro_contato_produtor",
//          "ignoredCount": 0
//        }
//
//      O service `conversationMemory` le e atualiza este JSON em
//      transacoes idempotentes.

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) corretoras.communication_style
    await queryInterface.addColumn(
      "corretoras",
      "communication_style",
      {
        type: Sequelize.ENUM(
          "tradicional",
          "premium",
          "tecnico",
          "agressivo",
          "regional",
          "corporativo",
        ),
        allowNull: false,
        defaultValue: "tradicional",
      },
    );

    // 2) corretora_leads.conversational_state
    await queryInterface.addColumn(
      "corretora_leads",
      "conversational_state",
      {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "corretora_leads",
      "conversational_state",
    );
    await queryInterface.removeColumn("corretoras", "communication_style");
  },
};
