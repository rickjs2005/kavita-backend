"use strict";

/**
 * Migration: add-cupom-codigo-to-pedidos
 *
 * Problema:
 *   O fingerprint de deduplicação do checkout considerava apenas user_id + itens.
 *   Dois submits com o mesmo carrinho mas cupons diferentes eram tratados como
 *   duplicata, retornando o pedido criado com o cupom anterior — financeiramente
 *   incorreto.
 *
 * O que esta migration faz:
 *   Adiciona `cupom_codigo VARCHAR(50) DEFAULT NULL` à tabela `pedidos`.
 *   O valor persistido é o código normalizado (trim+uppercase) no momento do checkout.
 *   Pedidos existentes ficam com NULL, o que equivale a "sem cupom" na lógica de dedup.
 *
 * Impacto:
 *   - Nenhum dado existente é alterado.
 *   - O checkoutController passa a incluir cupom_codigo na INSERT e na comparação
 *     de deduplicação (WHERE + GROUP BY pp.pedido_id, p.cupom_codigo).
 *   - Pedidos antigos (cupom_codigo IS NULL) continuam se comportando como "sem cupom"
 *     na janela de dedup de 2 minutos.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("pedidos", "cupom_codigo", {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
      after: "pagamento_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("pedidos", "cupom_codigo");
  },
};
