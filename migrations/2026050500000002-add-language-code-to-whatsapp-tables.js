"use strict";

// Correcao da Etapa 2 (ver docs/whatsapp-reativacao.md secao 7.5).
//
// Briefing original chamava o campo de "language"; o briefing operacional
// para o service / webhook / cutover Meta exige o nome canonico
// "language_code" e tambem um campo equivalente em whatsapp_messages
// para auditoria do idioma efetivamente usado no envio.
//
// Mudancas aditivas (sem perder dado):
//   1) RENAME whatsapp_templates.language -> language_code
//      (mantem tipo VARCHAR(10) NOT NULL DEFAULT 'pt_BR', adiciona COMMENT).
//   2) ADD whatsapp_messages.language_code
//      VARCHAR(10) NOT NULL DEFAULT 'pt_BR' COMMENT '...'.
//
// Por que CHANGE COLUMN em vez de Sequelize.renameColumn:
//   renameColumn em alguns dialects nao preserva default + comment;
//   CHANGE COLUMN (DDL nativo MySQL 8) garante tipo, default e comment
//   em uma so' instrucao. Padrao usado em outras migrations corretivas
//   do projeto.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE whatsapp_templates
         CHANGE COLUMN language language_code
         VARCHAR(10) NOT NULL DEFAULT 'pt_BR'
         COMMENT 'Código de idioma do template aprovado/submetido na Meta, ex: pt_BR'`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE whatsapp_messages
         ADD COLUMN language_code VARCHAR(10) NOT NULL DEFAULT 'pt_BR'
         COMMENT 'Código de idioma usado no envio do template WhatsApp, ex: pt_BR'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE whatsapp_messages DROP COLUMN language_code",
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE whatsapp_templates
         CHANGE COLUMN language_code language
         VARCHAR(10) NOT NULL DEFAULT 'pt_BR'`,
    );
  },
};
