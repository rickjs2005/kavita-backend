"use strict";

// B1 (auditoria automação) — novo valor "manual_pending" para o enum
// status_envio em comunicacoes_enviadas.
//
// Antes do B1 só existiam dois estados: sucesso | erro. Com WhatsApp
// no modo "manual" (link wa.me que admin clica) precisamos de um
// terceiro estado:
//
//   - sucesso       → mensagem foi enviada por canal automático
//                     (e-mail SMTP, ou no futuro WhatsApp Business API)
//   - manual_pending → link foi gerado e está disponível pro admin
//                     enviar manualmente — não temos como saber se
//                     o admin clicou e enviou de fato
//   - erro          → falhou na geração ou envio
//
// É um ALTER COLUMN aditivo (apenas adiciona valor ao enum), idempotente
// e seguro em produção.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE comunicacoes_enviadas
         MODIFY COLUMN status_envio
         ENUM('sucesso','erro','manual_pending')
         NOT NULL DEFAULT 'sucesso'`,
    );
  },

  async down(queryInterface) {
    // Reverte para o enum anterior. Linhas com manual_pending são
    // remapeadas para "sucesso" antes de remover o valor (preserva
    // histórico semelhante ao "operação concluída").
    await queryInterface.sequelize.query(
      `UPDATE comunicacoes_enviadas
          SET status_envio = 'sucesso'
        WHERE status_envio = 'manual_pending'`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE comunicacoes_enviadas
         MODIFY COLUMN status_envio
         ENUM('sucesso','erro')
         NOT NULL DEFAULT 'sucesso'`,
    );
  },
};
