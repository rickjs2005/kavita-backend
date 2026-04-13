"use strict";

// Tabela separada para feedback de satisfação do cliente após resolução
// de ocorrências. Permite métricas independentes e evolução futura.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE TABLE \`ocorrencia_feedbacks\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`ocorrencia_id\` int unsigned NOT NULL,
        \`usuario_id\` int NOT NULL,
        \`nota\` tinyint unsigned NOT NULL COMMENT '1=muito insatisfeito, 5=muito satisfeito',
        \`comentario\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_ocorrencia_feedback\` (\`ocorrencia_id\`),
        KEY \`idx_ocorrencia_feedbacks_usuario\` (\`usuario_id\`),
        CONSTRAINT \`fk_ocorrencia_feedbacks_ocorrencia\` FOREIGN KEY (\`ocorrencia_id\`) REFERENCES \`pedido_ocorrencias\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ocorrencia_feedbacks_usuario\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS `ocorrencia_feedbacks`;");
  },
};
