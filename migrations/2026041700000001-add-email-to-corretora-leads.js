"use strict";

// Sprint 1 — Fechamento do loop ao produtor.
//
// Adiciona coluna email em corretora_leads. O produtor passa a ter a
// opção de deixar e-mail no formulário público; quando presente,
// disparamos e-mail de confirmação "seu interesse foi enviado para
// a corretora X" fora da transação de criação do lead.
//
// Opcional: lead pode continuar existindo sem e-mail (produtor que
// não quer deixar). Por isso allowNull=true e sem índice único.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "email", {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_leads", "email");
  },
};
