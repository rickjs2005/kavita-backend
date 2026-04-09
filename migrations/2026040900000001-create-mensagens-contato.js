"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("mensagens_contato", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      telefone: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      assunto: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      mensagem: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("nova", "lida", "respondida", "arquivada"),
        allowNull: false,
        defaultValue: "nova",
      },
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
    });

    await queryInterface.addIndex("mensagens_contato", ["status"], {
      name: "idx_mensagens_contato_status",
    });

    await queryInterface.addIndex("mensagens_contato", ["created_at"], {
      name: "idx_mensagens_contato_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("mensagens_contato");
  },
};
