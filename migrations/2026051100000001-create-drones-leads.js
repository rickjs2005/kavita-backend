"use strict";

// Captura de leads do módulo Kavita Drones.
//
// Hoje o InterestFormSection (frontend) só monta link wa.me — o lead
// vai direto pro WhatsApp sem registro. Resultado: zero rastreio de
// quem demonstrou interesse, em qual modelo, em qual cidade.
//
// Esta tabela passa a registrar o lead ANTES do redirect pro WhatsApp.
// O wa.me continua acontecendo normalmente — o save é best-effort
// (frontend abre WhatsApp mesmo se o salvamento falhar).
//
// Status segue funil comercial padrão Kavita:
//   NOVO        — acabou de chegar, ninguém atendeu ainda
//   EM_CONTATO  — representante já abordou no WhatsApp
//   NEGOCIACAO  — proposta enviada, em discussão
//   CONVERTIDO  — fechou compra
//   PERDIDO     — desistiu, escolheu concorrente, etc.
//
// assigned_to é nullable e armazena admin_id quando algum admin
// "claim" o lead. FK leve (sem CASCADE) — se admin sumir, o lead
// continua atribuído ao id antigo (auditoria preservada).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("drones_leads", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      telefone: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      cidade: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      uf: {
        type: Sequelize.STRING(2),
        allowNull: true,
      },
      // Pode bater com drone_models.key, mas não impomos FK porque o
      // visitante pode escolher "ainda não sei" (vazio) e modelo pode
      // ser desativado depois sem invalidar o histórico de leads.
      modelo_interesse: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      mensagem: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      // De onde veio o lead (interest_form, whatsapp_landing, etc).
      // String livre para permitir novos canais sem migration.
      origem: {
        type: Sequelize.STRING(60),
        allowNull: true,
        defaultValue: "interest_form",
      },
      status: {
        type: Sequelize.ENUM(
          "NOVO",
          "EM_CONTATO",
          "NEGOCIACAO",
          "CONVERTIDO",
          "PERDIDO",
        ),
        allowNull: false,
        defaultValue: "NOVO",
      },
      assigned_to: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // Hash do IP origem (SHA256) — anti-spam/duplicata sem armazenar
      // PII bruta. Mesmo padrão de drone_comments.ip_hash.
      ip_hash: {
        type: Sequelize.CHAR(64),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(255),
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

    // Índice principal: admin filtra por status na lista (default NOVO).
    await queryInterface.addIndex(
      "drones_leads",
      ["status", "created_at"],
      { name: "idx_drones_leads_status_created" },
    );

    // Filtro por modelo_interesse no admin.
    await queryInterface.addIndex(
      "drones_leads",
      ["modelo_interesse"],
      { name: "idx_drones_leads_modelo" },
    );

    // Filtro por cidade/UF — útil pra rotear lead pro representante
    // certo (Manhuaçu/Espera Feliz/Cachoeira do Itapemirim).
    await queryInterface.addIndex(
      "drones_leads",
      ["uf", "cidade"],
      { name: "idx_drones_leads_uf_cidade" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("drones_leads");
  },
};
