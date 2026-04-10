"use strict";

// Adiciona password_hash em corretora_submissions para suportar o
// novo fluxo de cadastro público com senha: a corretora define a
// própria senha no momento do cadastro, o hash fica guardado na
// submission aguardando aprovação, e quando o admin aprova o
// sistema copia esse hash para o corretora_users recém-criado —
// eliminando a necessidade de convite manual por e-mail.
//
// Coluna NULLABLE por retrocompat: submissions antigas (criadas
// antes dessa mudança) continuam com password_hash = NULL e usam
// o fluxo antigo (admin precisa clicar "Criar acesso" depois).
// Submissions novas trazem o hash e são aprovadas com user
// automaticamente criado.
//
// Em rejeição, o service zera password_hash — não guardamos hash
// de submission que nunca virou corretora.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "corretora_submissions",
      "password_hash",
      {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: "facebook",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_submissions", "password_hash");
  },
};
