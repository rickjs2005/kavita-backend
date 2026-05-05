"use strict";

// Etapa 2 da reativacao do WhatsApp (ver docs/whatsapp-reativacao.md)
//
// Cria 3 tabelas dedicadas ao novo fluxo Mercado do Cafe + faz o
// seed dos 7 templates definitivos da corretora como rascunho
// (active=0, approved_at=NULL).
//
// Decisoes registradas na auditoria (Etapa 1):
//   - whatsapp_messages e' tabela NOVA, dedicada a corretora.
//     comunicacoes_enviadas continua sendo a verdade do modulo
//     Pedidos. Convergencia futura sai de uma sprint posterior.
//   - Coluna `provider` ENUM('manual','api','stub') existe em
//     whatsapp_messages para auditoria/relatorio/cutover (default
//     'stub' enquanto nao houver homologacao Meta + decisao
//     comercial).
//   - Em whatsapp_inbound usamos `handled_by_user_id` (nao
//     `_admin_id`) porque o tratamento pode ser feito por admin,
//     corretora_user ou usuario interno. INT sem FK direta para
//     nao restringir o dominio agora — comentario na coluna torna
//     a intencao explicita.
//   - Templates entram com active=0 e approved_at=NULL. Cutover
//     so' apos aprovacao Meta.

module.exports = {
  async up(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // whatsapp_templates
    // -------------------------------------------------------------
    await queryInterface.createTable("whatsapp_templates", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      key: {
        // Identificador logico do template (ex: corretora_lead_recebido).
        // Combina com `version` para multiplas versoes ativas/historicas.
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      version: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
      },
      language: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: "pt_BR",
      },
      category: {
        // UTILITY: transacional (default neste sprint — todos os 7
        // templates de corretora sao UTILITY por decisao do
        // comercial). MARKETING: promocional, exige opt-in explicito
        // do destinatario alem de aprovacao Meta. AUTHENTICATION
        // reservado para OTPs futuros.
        type: Sequelize.ENUM("UTILITY", "MARKETING", "AUTHENTICATION"),
        allowNull: false,
        defaultValue: "UTILITY",
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      variables: {
        // Lista das variaveis usadas no body (ex: ["nome_produtor",
        // "numero_contrato"]). Validacao no service compara as keys
        // do payload com este array antes de submeter pra Meta.
        type: Sequelize.JSON,
        allowNull: false,
      },
      meta_template_name: {
        // Nome aprovado na Meta (preenchido pos-cutover). Pode
        // diferir da `key` para conviver com versionamento Meta
        // (ex: corretora_lead_recebido_v1).
        type: Sequelize.STRING(160),
        allowNull: true,
      },
      active: {
        // 0 = rascunho (nao envia). 1 = ativo (envio liberado).
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
      },
      approved_at: {
        // Timestamp da aprovacao Meta. NULL ate cutover.
        type: Sequelize.DATE,
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
      "whatsapp_templates",
      ["key", "version"],
      { name: "uq_whatsapp_templates_key_version", unique: true },
    );
    await queryInterface.addIndex(
      "whatsapp_templates",
      ["active", "key"],
      { name: "idx_whatsapp_templates_active_key" },
    );

    // -------------------------------------------------------------
    // whatsapp_messages
    // -------------------------------------------------------------
    await queryInterface.createTable("whatsapp_messages", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_leads", key: "id" },
        onDelete: "SET NULL",
      },
      contract_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "contratos", key: "id" },
        onDelete: "SET NULL",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretoras", key: "id" },
        onDelete: "SET NULL",
      },
      recipient_phone: {
        // E.164 sem "+", ex: 5533999991234. normalizePhoneBR ja
        // entrega nesse formato.
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      template_key: {
        // FK logica (nao referencial) com whatsapp_templates.key.
        // Nao usamos FK fisica pra permitir mensagens ad-hoc com
        // texto livre (template_key=NULL + body preenchido).
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      body: {
        // Texto renderizado da mensagem. Sempre persistido para
        // auditoria — mesmo template aprovado, snapshot do que foi
        // enviado vai aqui.
        type: Sequelize.TEXT,
        allowNull: true,
      },
      provider: {
        // manual: link wa.me gerado, admin/corretor envia
        // manualmente. api: enviado pela Meta Cloud API. stub:
        // simulado — nao enviou nada (default no sprint atual e em
        // CI). Distinguir e' essencial para auditoria,
        // relatorios e homologacao.
        type: Sequelize.ENUM("manual", "api", "stub"),
        allowNull: false,
        defaultValue: "stub",
      },
      status: {
        // queued: aguardando envio (api). queued_stub: simulado,
        // nao enviado. manual_pending: link wa.me gerado, aguarda
        // operador clicar. sent: aceito pelo provider. delivered:
        // entregue ao aparelho. read: lido. failed: erro.
        type: Sequelize.ENUM(
          "queued",
          "queued_stub",
          "manual_pending",
          "sent",
          "delivered",
          "read",
          "failed",
        ),
        allowNull: false,
        defaultValue: "queued",
      },
      provider_message_id: {
        // Id retornado pela Meta — chave de idempotencia no webhook
        // de status.
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      retry_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      read_at: { type: Sequelize.DATE, allowNull: true },
      failed_at: { type: Sequelize.DATE, allowNull: true },
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
      "whatsapp_messages",
      ["recipient_phone"],
      { name: "idx_whatsapp_messages_recipient" },
    );
    await queryInterface.addIndex(
      "whatsapp_messages",
      ["lead_id", "created_at"],
      { name: "idx_whatsapp_messages_lead_created" },
    );
    await queryInterface.addIndex(
      "whatsapp_messages",
      ["contract_id", "created_at"],
      { name: "idx_whatsapp_messages_contract_created" },
    );
    await queryInterface.addIndex(
      "whatsapp_messages",
      ["corretora_id", "created_at"],
      { name: "idx_whatsapp_messages_corretora_created" },
    );
    await queryInterface.addIndex(
      "whatsapp_messages",
      ["status", "created_at"],
      { name: "idx_whatsapp_messages_status_created" },
    );
    await queryInterface.addIndex(
      "whatsapp_messages",
      ["provider_message_id"],
      {
        name: "uq_whatsapp_messages_provider_message_id",
        unique: true,
        // MySQL aceita multiplos NULLs em coluna UNIQUE — necessario
        // pq mensagens em modo stub/manual nao tem provider_message_id.
      },
    );

    // -------------------------------------------------------------
    // whatsapp_inbound
    // -------------------------------------------------------------
    await queryInterface.createTable("whatsapp_inbound", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      sender_phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      media_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      lead_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretora_leads", key: "id" },
        onDelete: "SET NULL",
      },
      contract_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "contratos", key: "id" },
        onDelete: "SET NULL",
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: "corretoras", key: "id" },
        onDelete: "SET NULL",
      },
      raw_payload: {
        // Payload bruto do webhook Meta — preservar para auditoria
        // e debug futuro (alteracoes no formato Meta nao perdem
        // contexto).
        type: Sequelize.JSON,
        allowNull: true,
      },
      provider_message_id: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      received_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      handled_by_user_id: {
        // Usuario responsavel pelo tratamento da mensagem inbound.
        // INT generico sem FK — pode ser admin, corretora_user ou
        // user interno; convencao definida no service que escreve
        // (handled_at + handled_by_user_id juntos quando alguem
        // marca como tratada).
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      handled_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("whatsapp_inbound", ["sender_phone"], {
      name: "idx_whatsapp_inbound_sender",
    });
    await queryInterface.addIndex(
      "whatsapp_inbound",
      ["lead_id", "received_at"],
      { name: "idx_whatsapp_inbound_lead_received" },
    );
    await queryInterface.addIndex(
      "whatsapp_inbound",
      ["corretora_id", "received_at"],
      { name: "idx_whatsapp_inbound_corretora_received" },
    );
    await queryInterface.addIndex(
      "whatsapp_inbound",
      ["provider_message_id"],
      {
        name: "uq_whatsapp_inbound_provider_message_id",
        unique: true,
      },
    );

    // -------------------------------------------------------------
    // SEED — 7 templates definitivos da corretora (rascunho)
    // -------------------------------------------------------------
    const now = new Date();
    const draftTemplates = [
      {
        key: "corretora_lead_recebido",
        category: "UTILITY",
        body: [
          "Olá, {{nome_corretora}}.",
          "",
          "Você recebeu um novo interesse de venda de café pelo Kavita Mercado do Café.",
          "",
          "Produtor: {{nome_produtor}}",
          "Cidade: {{cidade_produtor}}",
          "Volume informado: {{volume_cafe}}",
          "Tipo de café: {{tipo_cafe}}",
          "",
          "Acesse seu painel para analisar o contato e responder o produtor.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: [
          "nome_corretora",
          "nome_produtor",
          "cidade_produtor",
          "volume_cafe",
          "tipo_cafe",
        ],
      },
      {
        key: "corretora_corretor_designado",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "Seu atendimento no Kavita Mercado do Café foi direcionado para a corretora {{nome_corretora}}.",
          "",
          "Responsável pelo contato: {{nome_corretor}}",
          "",
          "A corretora poderá falar com você para entender melhor o café disponível, volume, localização e condições da negociação.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: ["nome_produtor", "nome_corretora", "nome_corretor"],
      },
      {
        key: "corretora_proposta_enviada",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "A corretora {{nome_corretora}} registrou uma proposta para sua negociação de café no Kavita Mercado do Café.",
          "",
          "Resumo da proposta:",
          "Volume: {{volume_cafe}}",
          "Valor informado: {{valor_proposta}}",
          "Condição: {{condicao_pagamento}}",
          "",
          "Acesse o atendimento ou fale com a corretora para conferir os detalhes antes de confirmar qualquer negociação.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: [
          "nome_produtor",
          "nome_corretora",
          "volume_cafe",
          "valor_proposta",
          "condicao_pagamento",
        ],
      },
      {
        key: "corretora_contrato_gerado",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "O contrato da sua negociação de café foi gerado no Kavita Mercado do Café.",
          "",
          "Contrato: {{numero_contrato}}",
          "Corretora: {{nome_corretora}}",
          "Volume: {{volume_cafe}}",
          "",
          "Confira as informações com atenção antes de seguir para a assinatura.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: [
          "nome_produtor",
          "numero_contrato",
          "nome_corretora",
          "volume_cafe",
        ],
      },
      {
        key: "corretora_contrato_assinatura_pendente",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "O contrato {{numero_contrato}} está aguardando sua assinatura.",
          "",
          "Corretora: {{nome_corretora}}",
          "Volume: {{volume_cafe}}",
          "",
          "Acesse o link enviado pela corretora ou entre em contato com ela para finalizar esta etapa.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: [
          "nome_produtor",
          "numero_contrato",
          "nome_corretora",
          "volume_cafe",
        ],
      },
      {
        key: "corretora_contrato_assinado",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "O contrato {{numero_contrato}} foi marcado como assinado no Kavita Mercado do Café.",
          "",
          "Corretora: {{nome_corretora}}",
          "Volume: {{volume_cafe}}",
          "",
          "Guarde essa informação para acompanhar a negociação com mais segurança.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: [
          "nome_produtor",
          "numero_contrato",
          "nome_corretora",
          "volume_cafe",
        ],
      },
      {
        key: "corretora_lembrete_retorno_produtor",
        category: "UTILITY",
        body: [
          "Olá, {{nome_produtor}}.",
          "",
          "Passando para lembrar que existe um atendimento em aberto no Kavita Mercado do Café com a corretora {{nome_corretora}}.",
          "",
          "Caso ainda tenha interesse na negociação, responda a corretora ou acesse seu atendimento para continuar.",
          "",
          "Mensagem automática do Kavita Mercado do Café.",
        ].join("\n"),
        variables: ["nome_produtor", "nome_corretora"],
      },
    ];

    await queryInterface.bulkInsert(
      "whatsapp_templates",
      draftTemplates.map((t) => ({
        key: t.key,
        version: 1,
        language: "pt_BR",
        category: t.category,
        body: t.body,
        variables: JSON.stringify(t.variables),
        meta_template_name: null,
        active: 0,
        approved_at: null,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    // Drop em ordem inversa de criacao para respeitar dependencias
    // (whatsapp_messages e whatsapp_inbound nao tem FK entre si nem
    // pra whatsapp_templates — ordem livre, mas mantemos espelhada
    // pra clareza).
    await queryInterface.dropTable("whatsapp_inbound");
    await queryInterface.dropTable("whatsapp_messages");
    await queryInterface.dropTable("whatsapp_templates");
  },
};
