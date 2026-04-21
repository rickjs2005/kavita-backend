"use strict";

// Fase 10.2 — status KYC denormalizado em `corretoras`.
//
// Fica aqui (em vez de joining com corretora_kyc) por 3 razões:
//   1. Consulta quente: toda emissão de contrato checa este status.
//   2. Filtros no admin ("listar corretoras pendentes") não exigem JOIN.
//   3. O FSM transita mesmo em cenário manual (admin aprova antes de
//      rodar adapter); estados intermediários não têm sempre
//      contraparte em corretora_kyc.
//
// Grandfather no próprio `up`: corretoras existentes com status
// 'active' continuam operacionais (kyc_status='verified'). Só as
// novas entrarão em 'pending_verification'.

// Helper idempotente — addColumn falha se já existe (e não queremos
// derrubar a migration só porque rodou parcialmente antes).
async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, spec);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, "corretoras", "kyc_status", {
      type: Sequelize.ENUM(
        "pending_verification",
        "under_review",
        "verified",
        "rejected",
      ),
      allowNull: false,
      defaultValue: "pending_verification",
    });
    await addColumnIfMissing(
      queryInterface,
      "corretoras",
      "kyc_verified_at",
      { type: Sequelize.DATE, allowNull: true },
    );

    // Grandfather — qualquer corretora já ativa e não deletada passa
    // como verificada. Evita quebrar o fluxo de quem já estava em
    // produção antes de ligarmos KYC bloqueante.
    await queryInterface.sequelize.query(`
      UPDATE corretoras
         SET kyc_status = 'verified',
             kyc_verified_at = COALESCE(kyc_verified_at, NOW())
       WHERE status = 'active'
         AND deleted_at IS NULL
    `);

    // Nota de trilha — `admin_id` é o nome da coluna em
    // corretora_admin_notes (não admin_user_id, que foi um lapso
    // da primeira versão da migration).
    await queryInterface.sequelize.query(`
      INSERT INTO corretora_admin_notes (corretora_id, admin_id, body, category, created_at)
      SELECT c.id, NULL,
             'Grandfather Fase 10.2: kyc_status marcado como verified automaticamente (verificação manual anterior à implementação do KYC).',
             'kyc',
             NOW()
        FROM corretoras c
       WHERE c.status = 'active' AND c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM corretora_admin_notes n
            WHERE n.corretora_id = c.id
              AND n.body LIKE 'Grandfather Fase 10.2%'
         )
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretoras", "kyc_verified_at");
    await queryInterface.removeColumn("corretoras", "kyc_status");
    // ENUM em MySQL precisa ser limpado manualmente — Sequelize drop
    // de coluna já remove o tipo implicitamente.
  },
};
