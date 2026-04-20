"use strict";

// Fase 10.1 — Contratos de compra e venda de café.
//
// Um contrato nasce ligado a um lead marcado como deal_won e carrega
// o snapshot dos dados do negócio (safra, sacas, preço, destino) no
// campo JSON `data_fields`. O snapshot é importante: se o lead for
// editado depois, o contrato não muda — ele é documento histórico.
//
// tipo ENUM
//   - disponivel     → café já colhido, entrega curta, preço fixo
//   - entrega_futura → compra a termo, safra futura, basis + CEPEA
//
// status ENUM
//   - draft      → PDF gerado, ainda não enviado para assinatura
//   - sent       → enviado para provedor de assinatura (stub ou ClickSign)
//   - signed     → assinatura concluída, hash imutável
//   - cancelled  → cancelado pela corretora antes da assinatura
//   - expired    → provedor devolveu vencido (prazo > N dias sem assinar)
//
// signer_provider é NULL em draft e preenchido no envio.
// qr_verification_token é UUID v4 único — usado na URL pública
// /verificar/:token que mostra hash + partes + data de assinatura.
//
// hash_sha256 é do binário PDF gerado, 64 hex chars. Fica registrado
// no momento do draft e NÃO muda — provedor de assinatura adiciona
// metadata na margem, não altera o conteúdo central.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contratos", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretora_leads", key: "id" },
        onDelete: "RESTRICT",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onDelete: "RESTRICT",
      },
      created_by_user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_users", key: "id" },
        onDelete: "SET NULL",
      },
      tipo: {
        type: Sequelize.ENUM("disponivel", "entrega_futura"),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          "draft",
          "sent",
          "signed",
          "cancelled",
          "expired",
        ),
        allowNull: false,
        defaultValue: "draft",
      },
      pdf_url: {
        // Path relativo dentro de /uploads, ex: contratos/12/45-<uuid>.pdf
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      hash_sha256: {
        type: Sequelize.CHAR(64),
        allowNull: false,
      },
      qr_verification_token: {
        // UUID v4 em formato canônico (36 chars).
        type: Sequelize.CHAR(36),
        allowNull: false,
        unique: true,
      },
      data_fields: {
        // Snapshot dos dados injetados no template. Serve como fonte
        // de verdade do conteúdo do contrato independente de mudanças
        // posteriores no lead.
        type: Sequelize.JSON,
        allowNull: false,
      },
      signer_provider: {
        // NULL em draft; "stub" ou "clicksign" a partir de sent.
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      signer_document_id: {
        // ID retornado pelo provedor ao criar o documento para assinar.
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      signer_envelope_id: {
        // Envelope/Pasta no provedor (ClickSign agrupa por envelope).
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      signed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancel_reason: {
        type: Sequelize.STRING(300),
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
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex(
      "contratos",
      ["corretora_id", "status", "created_at"],
      { name: "idx_contratos_corretora_status_created" },
    );
    await queryInterface.addIndex(
      "contratos",
      ["lead_id"],
      { name: "idx_contratos_lead" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contratos");
  },
};
