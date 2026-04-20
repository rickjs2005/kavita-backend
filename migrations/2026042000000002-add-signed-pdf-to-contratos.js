"use strict";

// Fase 10.1 — PR 2 — persiste o PDF devolvido pelo provedor de
// assinatura (ClickSign) como artefato separado do draft original.
//
//   pdf_url          → draft que foi para assinatura (imutável)
//   signed_pdf_url   → PDF com carimbo/trilha da ClickSign, baixado
//                       via webhook quando auto_close dispara
//   signed_hash_sha256 → hash do PDF assinado (diferente do draft,
//                        já que a ClickSign injeta metadados nas
//                        margens — auditoria fica completa)
//
// Mantemos o draft para que o QR Code impresso no rodapé do PDF
// original continue válido — o verificador público não precisa do
// PDF assinado para confirmar integridade do texto contratual.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("contratos", "signed_pdf_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
    await queryInterface.addColumn("contratos", "signed_hash_sha256", {
      type: Sequelize.CHAR(64),
      allowNull: true,
    });
    // Índice usado pela lookup por document_id vindo do webhook.
    // Sem unique — se o mesmo documento for recriado (edge case),
    // preferimos não quebrar por violação de constraint.
    await queryInterface.addIndex("contratos", ["signer_document_id"], {
      name: "idx_contratos_signer_document_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "contratos",
      "idx_contratos_signer_document_id",
    );
    await queryInterface.removeColumn("contratos", "signed_hash_sha256");
    await queryInterface.removeColumn("contratos", "signed_pdf_url");
  },
};
