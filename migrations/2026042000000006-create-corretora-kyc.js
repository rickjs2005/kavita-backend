"use strict";

// Fase 10.2 — verificação KYC/AML da corretora.
//
// Uma linha por corretora (UNIQUE em corretora_id) — é o snapshot
// de dados cadastrais oficiais que serviu de base para aprovar ou
// rejeitar o acesso da corretora a operações reguladas (emissão de
// contrato hoje; NFPe e CPR na Fase 11).
//
// `provider_response_raw` preserva o payload íntegro do provedor
// (mock/bigdatacorp/serpro/receita_ws/manual) para auditoria e
// eventual disputa — o admin pode revisar o que foi consultado
// sem depender de logs da API externa.
//
// `expires_at` é nulo hoje (KYC não expira no MVP); já deixamos
// preparado para revalidação periódica na Fase 10.2.1.
//
// `admin_notes` fica vazio quando aprovação é automática; quando
// o admin rejeita manualmente, registra a justificativa.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_kyc", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
        references: { model: "corretoras", key: "id" },
        onDelete: "CASCADE",
      },
      cnpj: {
        // Normalizado (14 dígitos, sem máscara) — evita duplicidade
        // e facilita match com payload do provedor.
        type: Sequelize.CHAR(14),
        allowNull: true,
      },
      razao_social: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      situacao_cadastral: {
        // ATIVA | INATIVA | BAIXADA | SUSPENSA | INAPTA — string
        // livre porque provedores variam nomenclatura.
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      qsa: {
        // JSON: [{ nome, cpf_cnpj, qualificacao, entrada_em }, ...]
        type: Sequelize.JSON,
        allowNull: true,
      },
      endereco: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      natureza_juridica: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      provider: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "mock",
      },
      provider_response_raw: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      risk_score: {
        // 0-100 — provedor decide a escala. Reservamos coluna para
        // quando ligarmos decisão automática com base em score.
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      verified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      verified_by_admin_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      admin_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      rejected_reason: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex("corretora_kyc", ["cnpj"], {
      name: "idx_corretora_kyc_cnpj",
    });
    await queryInterface.addIndex("corretora_kyc", ["provider"], {
      name: "idx_corretora_kyc_provider",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_kyc");
  },
};
