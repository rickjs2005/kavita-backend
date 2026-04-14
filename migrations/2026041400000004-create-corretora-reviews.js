"use strict";

// Sprint 4 — Reviews de corretoras.
//
// Fluxo de moderação:
//   1. Produtor envia review via formulário público (status = 'pending')
//   2. Admin modera no /admin/mercado-do-cafe/reviews
//      - 'approved' → aparece na página pública da corretora
//      - 'rejected' → fica armazenado mas nunca exibido (log)
//   3. Listagem pública filtra por status = 'approved' only
//
// Ligação ao lead: opcional. Se o produtor já enviou lead antes e
// veio pelo link de pós-atendimento, lead_id cria vínculo e mostra
// "Cliente verificado". Senão, é review livre. Unique(corretora_id,
// lead_id) impede duplicação quando lead_id existe.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_reviews", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Vínculo opcional com lead. Quando presente, a review conta
      // como "cliente verificado" (alguém que realmente fez contato).
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_leads", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      nome_autor: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      cidade_autor: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      rating: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false,
        // MySQL não tem CHECK constraint reliable — validamos na Zod.
      },
      comentario: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      // Quem moderou (admin) e quando. Moderação manual no início;
      // auto-approval pode vir depois via heurísticas.
      reviewed_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      // Anti-spam / auditoria
      source_ip: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    // Listagem pública da corretora (só approved) — índice principal.
    await queryInterface.addIndex(
      "corretora_reviews",
      ["corretora_id", "status", "created_at"],
      { name: "idx_reviews_corretora_status" },
    );
    // Admin lista todas as pendentes (fila de moderação).
    await queryInterface.addIndex("corretora_reviews", ["status"], {
      name: "idx_reviews_status",
    });
    // Evita review duplicada vinculada ao mesmo lead.
    await queryInterface.addIndex(
      "corretora_reviews",
      ["corretora_id", "lead_id"],
      {
        name: "idx_reviews_corretora_lead",
        where: { lead_id: { [Sequelize.Op.not]: null } },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_reviews");
  },
};
