"use strict";

// Fase 3 — notas internas da corretora sobre um lead específico.
//
// Diferente de `nota_interna` (coluna singular em corretora_leads, um
// texto só), esta tabela guarda histórico: cada nota tem autor e data,
// aparece como thread na timeline do detalhe do lead.
//
// Escopo:
//   - tenant-scoped por corretora_id (mesmo padrão do resto do módulo)
//   - FK com ON DELETE CASCADE (lead arquivado => notas somem junto)
//   - author_user_id pode ficar NULL se o usuário for removido da
//     equipe depois (preservamos a nota, só perdemos o autor)

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_lead_notes", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_leads", key: "id" },
        onDelete: "CASCADE",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onDelete: "CASCADE",
      },
      author_user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_users", key: "id" },
        onDelete: "SET NULL",
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "corretora_lead_notes",
      ["lead_id", "created_at"],
      { name: "idx_lead_notes_lead_created" },
    );
    await queryInterface.addIndex(
      "corretora_lead_notes",
      ["corretora_id", "created_at"],
      { name: "idx_lead_notes_corretora_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_lead_notes");
  },
};
