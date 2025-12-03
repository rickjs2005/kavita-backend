// utils/adminLogger.js
const pool = require('../config/pool');

/**
 * logAdminAction({
 *   adminId: 1,
 *   acao: 'update_status',
 *   entidade: 'pedido',
 *   entidadeId: 123
 * });
 */
async function logAdminAction({ adminId, acao, entidade, entidadeId = null }) {
  if (!adminId || !acao || !entidade) return;

  try {
    await pool.query(
      'INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)',
      [adminId, acao, entidade, entidadeId]
    );
  } catch (err) {
    console.error('Erro ao registrar log de admin:', err.message);
  }
}

module.exports = logAdminAction;
