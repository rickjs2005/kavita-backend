const pool = require('../config/pool');

/**
 * Registra um log de ação do admin.
 *
 * @param {number} adminId    - ID do admin que realizou a ação
 * @param {string} acao       - Ação executada (ex: 'criou', 'editou', 'excluiu', 'login', etc.)
 * @param {string} entidade   - Entidade afetada (ex: 'produto', 'pedido', 'cupom', 'servico')
 * @param {number|null} entidadeId - ID do registro afetado (pode ser null para ações genéricas)
 *
 * Exemplo:
 *   await registrarLog(req.admin.id, 'criou', 'produto', novoProdutoId);
 */
async function registrarLog(adminId, acao, entidade, entidadeId = null) {
  if (!adminId || !acao || !entidade) {
    throw new Error(
      'registrarLog: adminId, acao e entidade são obrigatórios.'
    );
  }

  await pool.query(
    `
      INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id)
      VALUES (?, ?, ?, ?)
    `,
    [adminId, acao, entidade, entidadeId]
  );
}

module.exports = {
  registrarLog,
};
