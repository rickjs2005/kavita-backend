"use strict";

// Sprint 7 — Operação física e hiper-localidade.
//
// Alinha o sistema ao fluxo real de balcão das corretoras da Zona da
// Mata: recepção de amostras físicas, mapeamento de córregos (alta
// relevância na conversa do corretor com o produtor) e controle de
// lote vendido para evitar que equipe tente amostra que já saiu.
//
// Campos adicionados em corretora_leads:
//
//   corrego_localidade    — nome livre do córrego/localidade (ex:
//                           "Córrego Pedra Bonita", "Serra da Boa
//                           Vista"). Identifica qualidade pela
//                           altitude/região.
//   safra_tipo            — 'atual' (safra em colheita) ou
//                           'remanescente' (estoque de safras
//                           passadas). Muda estratégia de preço.
//   amostra_status        — fluxo físico de balcão:
//                           'nao_entregue'  → produtor falou mas nada
//                                             chegou na mesa
//                           'prometida'     → produtor confirmou que
//                                             vai trazer
//                           'recebida'      → amostra física no balcão
//                           'laudada'       → avaliação técnica feita
//   lote_disponivel       — boolean. Produtor pode sinalizar via link
//                           único "já vendi para outra pessoa" — todas
//                           as corretoras que receberam aquele telefone
//                           são notificadas (broadcast).
//   telefone_normalizado  — digits-only + prefixo 55, coluna derivada
//                           usada como chave de broadcast de lote.
//                           Populada automaticamente no create.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "corrego_localidade", {
      type: Sequelize.STRING(120),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "safra_tipo", {
      type: Sequelize.ENUM("atual", "remanescente"),
      allowNull: true,
    });

    await queryInterface.addColumn("corretora_leads", "amostra_status", {
      type: Sequelize.ENUM(
        "nao_entregue",
        "prometida",
        "recebida",
        "laudada",
      ),
      allowNull: false,
      defaultValue: "nao_entregue",
    });

    await queryInterface.addColumn("corretora_leads", "lote_disponivel", {
      type: Sequelize.TINYINT(1),
      allowNull: false,
      defaultValue: 1,
    });

    await queryInterface.addColumn("corretora_leads", "telefone_normalizado", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    // Backfill: popular telefone_normalizado das linhas existentes.
    // Extrai só dígitos e adiciona prefixo 55 se necessário.
    await queryInterface.sequelize.query(`
      UPDATE corretora_leads
      SET telefone_normalizado = CONCAT(
        CASE
          WHEN REGEXP_REPLACE(telefone, '[^0-9]', '') LIKE '55%' THEN ''
          ELSE '55'
        END,
        REGEXP_REPLACE(telefone, '[^0-9]', '')
      )
      WHERE telefone IS NOT NULL AND telefone != ''
    `);

    // Índices operacionais:
    // 1. Kanban de amostras no painel (filtro por status).
    await queryInterface.addIndex(
      "corretora_leads",
      ["corretora_id", "amostra_status"],
      { name: "idx_leads_corretora_amostra" },
    );

    // 2. Broadcast de lote vendido: query por telefone_normalizado +
    //    lote_disponivel = 1.
    await queryInterface.addIndex(
      "corretora_leads",
      ["telefone_normalizado", "lote_disponivel"],
      { name: "idx_leads_telefone_lote" },
    );

    // 3. Widget admin "córregos ativos" — ranking por córrego na semana.
    await queryInterface.addIndex(
      "corretora_leads",
      ["corrego_localidade", "created_at"],
      { name: "idx_leads_corrego_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_leads_corrego_created",
    );
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_leads_telefone_lote",
    );
    await queryInterface.removeIndex(
      "corretora_leads",
      "idx_leads_corretora_amostra",
    );
    await queryInterface.removeColumn("corretora_leads", "telefone_normalizado");
    await queryInterface.removeColumn("corretora_leads", "lote_disponivel");
    await queryInterface.removeColumn("corretora_leads", "amostra_status");
    await queryInterface.removeColumn("corretora_leads", "safra_tipo");
    await queryInterface.removeColumn("corretora_leads", "corrego_localidade");
  },
};
