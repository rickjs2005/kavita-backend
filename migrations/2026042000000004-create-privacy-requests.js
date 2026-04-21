"use strict";

// Fase 10.3 — solicitações LGPD (exportação + exclusão de dados).
//
// Uma linha por solicitação do titular. Admin trata manualmente no
// MVP; cron futuro executa exclusão agendada após janela de 30 dias.
//
// `subject_type` é extensível (producer hoje; user da loja, corretora
// no futuro). `subject_email` guarda snapshot do email no momento da
// solicitação — se a conta for anonimizada antes do fim do processo,
// ainda sabemos a quem responder (auditoria).
//
// Status:
//   pending    → recebida, aguardando admin
//   processing → admin validou, em execução
//   completed  → exportação enviada ou conta anonimizada
//   rejected   → pedido inválido (ex.: email não bate com cadastro)
//   retained   → retenção parcial justificada (ex.: pedido fiscal de 5 anos)
//
// `scheduled_purge_at` só é preenchido em delete-request — data em
// que o job executa a anonimização. Nulo em export.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("privacy_requests", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      subject_type: {
        type: Sequelize.ENUM("producer", "user", "corretora_user"),
        allowNull: false,
      },
      subject_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      subject_email: {
        // Snapshot — preservado mesmo que a conta seja anonimizada
        // antes da conclusão da solicitação.
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      request_type: {
        type: Sequelize.ENUM("export", "delete"),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          "pending",
          "processing",
          "completed",
          "rejected",
          "retained",
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      status_reason: {
        // Motivo da rejeição/retenção ou mensagem do titular na
        // solicitação. Texto curto para auditoria.
        type: Sequelize.TEXT,
        allowNull: true,
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      scheduled_purge_at: {
        // Janela de arrependimento (padrão 30 dias). Só em delete.
        type: Sequelize.DATE,
        allowNull: true,
      },
      admin_user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      request_meta: {
        // IP + user-agent + motivo fornecido pelo titular. JSON
        // pra não criar 3 colunas que dificilmente serão indexadas.
        type: Sequelize.JSON,
        allowNull: true,
      },
    });

    await queryInterface.addIndex(
      "privacy_requests",
      ["subject_type", "subject_id"],
      { name: "idx_privacy_requests_subject" },
    );
    await queryInterface.addIndex(
      "privacy_requests",
      ["status", "scheduled_purge_at"],
      { name: "idx_privacy_requests_purge" },
    );
    await queryInterface.addIndex(
      "privacy_requests",
      ["requested_at"],
      { name: "idx_privacy_requests_requested_at" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("privacy_requests");
  },
};
