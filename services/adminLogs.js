// services/adminLogs.js
//
// Serviço de auditoria admin.
//
// Política de falha deliberada: logAdminAction nunca propaga erro ao caller.
// Razão: falha de log não deve cancelar a operação de negócio que a originou.
// Callers (authAdminController, rolesAdminService, etc.) chamam sem await
// — erros não seriam capturáveis de qualquer forma.
// A falha é registrada via logger.error para garantir observabilidade em produção.

const adminLogsRepo = require("../repositories/adminLogsRepository");
const { logger } = require("../lib");

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
    await adminLogsRepo.insertLog({ adminId, acao, entidade, entidadeId });
  } catch (err) {
    logger.error({ adminId, acao, entidade, entidadeId, err }, "Falha ao registrar log de admin");
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
