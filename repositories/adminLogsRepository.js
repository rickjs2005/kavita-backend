// repositories/adminLogsRepository.js
//
// Acesso a dados da tabela `admin_logs`.
// Usado por: services/adminLogs.js
//
// Erros de query propagam sem tratamento — o service define a política de falha.

const pool = require("../config/pool");

/**
 * Insere um registro de auditoria na tabela admin_logs.
 *
 * @param {{ adminId: number, acao: string, entidade: string, entidadeId?: number|null }} params
 */
async function insertLog({ adminId, acao, entidade, entidadeId = null }) {
  await pool.query(
    "INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)",
    [adminId, acao, entidade, entidadeId]
  );
}

module.exports = {
  insertLog,
};
