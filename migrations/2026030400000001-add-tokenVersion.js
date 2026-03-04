"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Add tokenVersion to usuarios
      await queryInterface.sequelize.query(
        "ALTER TABLE `usuarios` ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;",
        { transaction: t }
      );
      // Add tokenVersion to admins
      await queryInterface.sequelize.query(
        "ALTER TABLE `admins` ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;",
        { transaction: t }
      );
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        "ALTER TABLE `usuarios` DROP COLUMN `tokenVersion`;",
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE `admins` DROP COLUMN `tokenVersion`;",
        { transaction: t }
      );
    });
  },
};
