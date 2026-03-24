const pool = require("../config/pool");

/**
 * Registra um log de ação do admin.
 * Interface principal — aceita objeto nomeado, silenciosa em caso de erro.
 *
 * @param {{ adminId, acao, entidade, entidadeId? }} params
 *
 * Exemplo:
 *   await logAdminAction({ adminId: req.admin.id, acao: 'criou', entidade: 'produto', entidadeId: id });
 */
async function logAdminAction({ adminId, acao, entidade, entidadeId = null } = {}) {
  if (!adminId || !acao || !entidade) return;

  try {
    await pool.query(
      "INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)",
      [adminId, acao, entidade, entidadeId]
    );
  } catch (err) {
    console.error("Erro ao registrar log de admin:", err.message);
  }
}

/**
 * @deprecated Use logAdminAction({ adminId, acao, entidade, entidadeId }) em vez disso.
 * Mantido para compatibilidade com callers que usam a assinatura posicional.
 */
async function registrarLog(adminId, acao, entidade, entidadeId = null) {
  return logAdminAction({ adminId, acao, entidade, entidadeId });
}

module.exports = {
  logAdminAction,
  registrarLog,
};
