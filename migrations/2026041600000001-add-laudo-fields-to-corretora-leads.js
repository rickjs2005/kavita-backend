"use strict";

// Laudo operacional — classificação de café que o corretor faz
// quando "bate o café" (prova a amostra).
//
// Campos:
//   bebida_classificacao  — resultado sensorial (especial/dura/riado/rio/escolha)
//   pontuacao_sca         — nota SCA (0-100), opcional
//   preco_referencia_saca — preço em R$/saca que o corretor usou como base
//
// Todos opcionais — lead pode existir sem laudo (fase de captação).
// Quando preenchidos, o painel exibe selo de classificação e libera
// o botão "Enviar Laudo via WhatsApp".

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "bebida_classificacao", {
      type: Sequelize.ENUM(
        "especial",
        "dura",
        "riado",
        "rio",
        "escolha",
      ),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "pontuacao_sca", {
      type: Sequelize.DECIMAL(5, 1),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "preco_referencia_saca", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_leads", "preco_referencia_saca");
    await queryInterface.removeColumn("corretora_leads", "pontuacao_sca");
    await queryInterface.removeColumn("corretora_leads", "bebida_classificacao");
  },
};
