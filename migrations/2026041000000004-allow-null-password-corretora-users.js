"use strict";

// Torna corretora_users.password_hash opcional para suportar o estado
// "convite pendente" (first access). Quando o admin convida uma
// corretora nova, o row é criado com password_hash = NULL; a corretora
// recebe um e-mail de primeiro acesso, abre o link, define a senha, e
// a partir daí password_hash deixa de ser NULL.
//
// Regra de negócio no login (verificada em authCorretoraController):
// password_hash IS NULL → conta pendente de primeiro acesso, login
// bloqueado com mensagem instruindo a corretora a usar o link do
// e-mail ou "Esqueci minha senha".

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("corretora_users", "password_hash", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Atenção: o rollback falhará se houver rows com password_hash NULL.
    // Nesse caso, antes do rollback é preciso decidir: (a) deletar os
    // usuários pendentes ou (b) definir uma senha placeholder para eles.
    await queryInterface.changeColumn("corretora_users", "password_hash", {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};
