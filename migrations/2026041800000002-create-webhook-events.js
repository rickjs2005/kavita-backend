"use strict";

// Fase 3 Etapa A — Idempotência de webhooks de gateway de pagamento.
//
// Gateways (Asaas, Pagar.me, Stripe) reenviam eventos quando não
// recebem 200 rapidamente. Sem idempotência, uma mesma confirmação
// de pagamento pode dobrar cobranças ou criar subscriptions
// fantasmas. Esta tabela é append-only com UNIQUE por (provider,
// provider_event_id) — INSERT IGNORE atua como lock natural.
//
// Campos:
//   provider            — "asaas" | "pagarme" | futuro
//   provider_event_id   — id único do gateway (obrigatório no header
//                         ou no payload; depende do provider)
//   event_type          — PAYMENT_CONFIRMED, PAYMENT_OVERDUE, etc.
//                         mantido como string livre para aceitar
//                         expansão de provider sem migration
//   payload             — JSON bruto recebido (auditoria + reprocessar)
//   processed_at        — NULL = pending, datetime = sucesso
//   processing_error    — mensagem se falhou
//   retry_count         — contador de reprocessamento manual
//
// Nota de implementação:
//   Usamos SQL cru em vez de queryInterface.createTable + addIndex
//   porque essa combinação falhou no ambiente do projeto com
//   "Key column 'provider' doesn't exist in table" — bug conhecido
//   de Sequelize 6 onde o createTable pode sair silenciosamente
//   inválido (ou a tabela fica em estado parcial entre reruns da
//   migration). Com CREATE TABLE + DROP IF EXISTS, tudo fica
//   atômico em uma única statement e a migration é reexecutável
//   em dev se precisar.
//
//   DROP IF EXISTS é seguro porque a tabela é novinha nesta sprint:
//   nenhum ambiente tem dados de pagamento reais ainda. Em prod, o
//   risco é zero porque a tabela nasce vazia e só começa a receber
//   eventos depois que o endpoint do webhook for exposto (Etapa C).

module.exports = {
  async up(queryInterface) {
    // Limpa resíduo parcial caso uma execução anterior tenha falhado
    // no meio do caminho (createTable "passou" mas addIndex quebrou).
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS webhook_events",
    );

    await queryInterface.sequelize.query(`
      CREATE TABLE webhook_events (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        provider VARCHAR(20) NOT NULL,
        provider_event_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(60) NOT NULL,
        payload JSON NULL,
        processed_at DATETIME NULL,
        processing_error TEXT NULL,
        retry_count INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_webhook_provider_event (provider, provider_event_id),
        KEY idx_webhook_unprocessed (processed_at, provider),
        KEY idx_webhook_event_type (event_type, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS webhook_events",
    );
  },
};
