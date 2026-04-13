"use strict";

// Cria tabela de ocorrências de pedidos.
// Permite que o cliente sinalize problemas (ex.: endereço incorreto)
// e o admin analise, responda e aplique taxa extra se necessário.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE TABLE \`pedido_ocorrencias\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`pedido_id\` int NOT NULL,
        \`usuario_id\` int NOT NULL,
        \`tipo\` enum('endereco_incorreto') NOT NULL,
        \`motivo\` varchar(100) NOT NULL,
        \`observacao\` text,
        \`status\` enum('aberta','em_analise','resolvida','rejeitada') NOT NULL DEFAULT 'aberta',
        \`resposta_admin\` text,
        \`taxa_extra\` decimal(10,2) DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_pedido_ocorrencias_pedido\` (\`pedido_id\`),
        KEY \`idx_pedido_ocorrencias_status\` (\`status\`),
        CONSTRAINT \`fk_pedido_ocorrencias_pedido\` FOREIGN KEY (\`pedido_id\`) REFERENCES \`pedidos\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_pedido_ocorrencias_usuario\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS `pedido_ocorrencias`;");
  },
};
