"use strict";

// Índice de performance para dashboards do Mercado do Café.
//
// Motivo: a tab "Regional" do admin (`/admin/mercado-do-cafe`) e o KPI
// "leads pendurados" fazem WHERE created_at >= ? ORDER BY created_at DESC.
// Em escala (30-90 dias de leads), a ausência de índice em created_at
// faz queries regionais virarem full table scan.
//
// Índice composto (status, created_at) cobre também o inbox da corretora
// quando filtra "new" / "contacted" por data.

const TABLE = "corretora_leads";
const IDX_CREATED = "idx_corretora_leads_created_at";
const IDX_STATUS_CREATED = "idx_corretora_leads_status_created_at";

async function hasIndex(queryInterface, table, name) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    { replacements: [table, name] },
  );
  return Number(rows[0]?.c || 0) > 0;
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasIndex(queryInterface, TABLE, IDX_CREATED))) {
      await queryInterface.addIndex(TABLE, ["created_at"], {
        name: IDX_CREATED,
      });
    }
    if (!(await hasIndex(queryInterface, TABLE, IDX_STATUS_CREATED))) {
      await queryInterface.addIndex(TABLE, ["status", "created_at"], {
        name: IDX_STATUS_CREATED,
      });
    }
  },

  async down(queryInterface) {
    if (await hasIndex(queryInterface, TABLE, IDX_STATUS_CREATED)) {
      await queryInterface.removeIndex(TABLE, IDX_STATUS_CREATED);
    }
    if (await hasIndex(queryInterface, TABLE, IDX_CREATED)) {
      await queryInterface.removeIndex(TABLE, IDX_CREATED);
    }
  },
};
