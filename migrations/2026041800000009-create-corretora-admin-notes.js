"use strict";

// Fase 7 — Notas internas do admin Kavita sobre a corretora.
//
// Diferente de `corretora_lead_notes` (nota sobre um lead específico)
// e de `corretora.description` (texto público). Esta tabela guarda
// observações privadas da equipe Kavita: "aguardando documento",
// "boa pra exportação", "pediu desconto", "verificar SLA".
//
// Nunca é exposta ao painel da corretora — stritamente admin-only.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_admin_notes", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onDelete: "CASCADE",
      },
      admin_id: {
        // FK para admins (ou usuarios admin). Mantemos allowNull=true
        // pra quando o admin é removido da equipe a nota persiste.
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      admin_nome: {
        // Copiado no momento da criação — sobrevive à deleção do admin.
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      category: {
        // Tag opcional para filtrar: pagamento, documento, comercial,
        // qualidade, observação. Campo livre, não enum, pra admin
        // evoluir vocabulário sem migration.
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "corretora_admin_notes",
      ["corretora_id", "created_at"],
      { name: "idx_corretora_admin_notes_corretora_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_admin_notes");
  },
};
