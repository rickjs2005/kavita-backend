"use strict";

/**
 * Migration: fix-tokenVersion-default
 *
 * Problema:
 *   A migration anterior (2026030400000001-add-tokenVersion) adicionou a coluna
 *   com DEFAULT 1. O código agora usa `tokenVersion ?? 0` como fallback — tornando
 *   0 o valor canônico de "ainda não definido". Manter DEFAULT 1 no banco cria
 *   inconsistência entre o estado do DB e o fallback do código.
 *
 * O que esta migration faz:
 *   1. Backfill: coloca 0 em qualquer linha que, por algum motivo, tenha NULL.
 *      (Improvável, pois a coluna já era NOT NULL, mas garante zero surpresas.)
 *   2. ALTER TABLE: muda o DEFAULT de 1 para 0 em `usuarios` e `admins`.
 *      NOT NULL é mantido.
 *
 * Impacto:
 *   - Linhas existentes com tokenVersion=1 (da migration anterior) NÃO são alteradas.
 *     Elas continuam em 1, e o próximo login confirma esse valor no JWT. Sem impacto.
 *   - Novos registros criados a partir de agora recebem DEFAULT 0, alinhado com o
 *     fallback do código.
 *   - Rollback restaura DEFAULT 1 (valores 0 não são revertidos — seriam tokens já
 *     expirados de qualquer forma).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      // 1. Backfill de NULLs eventuais (defensive — coluna já é NOT NULL)
      await queryInterface.sequelize.query(
        "UPDATE `usuarios` SET `tokenVersion` = 0 WHERE `tokenVersion` IS NULL;",
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "UPDATE `admins` SET `tokenVersion` = 0 WHERE `tokenVersion` IS NULL;",
        { transaction: t }
      );

      // 2. Muda DEFAULT de 1 para 0, mantém NOT NULL
      await queryInterface.sequelize.query(
        "ALTER TABLE `usuarios` MODIFY COLUMN `tokenVersion` INT NOT NULL DEFAULT 0;",
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE `admins` MODIFY COLUMN `tokenVersion` INT NOT NULL DEFAULT 0;",
        { transaction: t }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Reverte DEFAULT para 1 (estado anterior)
      await queryInterface.sequelize.query(
        "ALTER TABLE `usuarios` MODIFY COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;",
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE `admins` MODIFY COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;",
        { transaction: t }
      );
    });
  },
};
