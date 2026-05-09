"use strict";

// migrations/2026050800000001-create-consents-table.js
//
// Cria a tabela `consents` — evidência LGPD de aceite de termos.
//
// Cada linha representa um aceite explícito de "Termos de Uso + Política
// de Privacidade" por um titular de dados, em algum fluxo do sistema
// (cadastro de usuário, cadastro de corretora, lead público de café,
// formulário de interesse Drones, etc.).
//
// Por que tabela dedicada (e não coluna em cada fluxo):
//   - Auditoria LGPD pede evidência granular: data + versão + canal + IP
//     + user-agent. Em coluna esses campos pesam em todas as tabelas
//     existentes (usuarios, corretoras, corretora_leads, drone_leads).
//   - Termos evoluem (v1, v2, v3...). Quando o titular re-aceita uma
//     versão nova, registra-se uma linha nova; nunca sobrescreve.
//   - Mesmo titular pode ter múltiplos aceites em fluxos diferentes
//     (ex.: produtor cadastra na loja e depois manda lead p/ corretora).
//   - Anonymous opt-ins: lead público de drones pode aceitar sem ter
//     subject_id. Mantemos email para correlação posterior.
//
// Campos:
//   subject_type — 'user' | 'corretora' | 'corretora_lead' | 'drone_lead'
//   subject_id   — id na tabela do subject_type (nullable se anônimo)
//   subject_email — email opcional p/ correlação quando subject_id null
//   terms_version, privacy_version — semver dos textos aceitos
//   source       — onde aceitou ('register', 'corretora_signup', etc.)
//   ip, user_agent — evidência forense
//   created_at   — timestamp do aceite (NÃO atualiza)

const TABLE = "consents";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE, {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      subject_type: {
        type: Sequelize.ENUM(
          "user",
          "corretora",
          "corretora_lead",
          "drone_lead",
        ),
        allowNull: false,
      },
      subject_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      subject_email: {
        type: Sequelize.STRING(254),
        allowNull: true,
      },
      terms_version: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      privacy_version: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      source: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Índice por subject (busca: "todos os aceites do usuário X")
    await queryInterface.addIndex(TABLE, ["subject_type", "subject_id"], {
      name: "idx_consents_subject",
    });

    // Índice por email (busca: "aceites do email X" — útil quando subject_id é null)
    await queryInterface.addIndex(TABLE, ["subject_email"], {
      name: "idx_consents_email",
    });

    // Índice por source + created_at (relatório: "quantos aceites no register no último mês")
    await queryInterface.addIndex(TABLE, ["source", "created_at"], {
      name: "idx_consents_source_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(TABLE, "idx_consents_source_date");
    await queryInterface.removeIndex(TABLE, "idx_consents_email");
    await queryInterface.removeIndex(TABLE, "idx_consents_subject");
    await queryInterface.dropTable(TABLE);
  },
};
