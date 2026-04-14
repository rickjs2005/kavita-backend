// services/adminAuditService.js
//
// Helper para gravar eventos de auditoria do admin. Usado pelos
// controllers existentes em pontos sensíveis:
//
//   corretora.approved, corretora.rejected
//   corretora.status_changed, corretora.featured_changed
//   review.moderated
//   plan.assigned, plan.canceled
//   city_promotion.created, city_promotion.deactivated
//   team.invited (admin convidando corretora user)
//
// Fire-and-forget — jamais bloqueia a ação principal.
"use strict";

const repo = require("../repositories/adminAuditLogsRepository");
const logger = require("../lib/logger");

/**
 * Grava evento de auditoria. Nunca throw — audit nunca deve derrubar
 * a operação que está sendo auditada.
 *
 * @param {Object} params
 * @param {Object} params.req            request Express (pega admin + ip + ua)
 * @param {string} params.action         ex: "corretora.approved"
 * @param {string} [params.targetType]   ex: "corretora", "review", "plan"
 * @param {number} [params.targetId]     id do alvo
 * @param {Object} [params.meta]         payload livre (before/after, reason)
 */
async function record({ req, action, targetType, targetId, meta }) {
  try {
    await repo.create({
      admin_id: req?.admin?.id ?? null,
      admin_nome: req?.admin?.nome ?? null,
      action,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      meta,
      ip: req?.ip ?? null,
      user_agent:
        req?.get?.("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (err) {
    // Falha de audit é aceitável — log e seguir.
    logger.warn(
      { err: err?.message ?? String(err), action },
      "admin.audit.failed",
    );
  }
}

module.exports = { record };
