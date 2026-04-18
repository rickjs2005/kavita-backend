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
/**
 * Fase 7 — helper para extrair before/after de UPDATEs. Dado dois
 * objetos (antes e depois) e uma lista de campos relevantes, retorna
 * `{ before, after, changed_fields }` com apenas os que MUDARAM.
 * Mantém o audit log enxuto (evita registrar "campo X não mudou").
 *
 * Comparação é rasa (===) — suficiente pra strings/numbers/booleans
 * que dominam o domínio. Para arrays/objects, compara via JSON.stringify
 * (aceitável porque nossos objetos aqui são pequenos e previsíveis).
 */
function diffFields(before, after, fields) {
  const result = { before: {}, after: {}, changed_fields: [] };
  for (const field of fields) {
    const b = before?.[field];
    const a = after?.[field];
    // null e undefined são semanticamente equivalentes no audit:
    // ambos representam "ausência". Normaliza antes de comparar.
    const bNorm = b ?? null;
    const aNorm = a ?? null;
    const bothArrayLike =
      (bNorm && typeof bNorm === "object") ||
      (aNorm && typeof aNorm === "object");
    const same = bothArrayLike
      ? JSON.stringify(bNorm) === JSON.stringify(aNorm)
      : bNorm === aNorm;
    if (!same) {
      result.before[field] = bNorm;
      result.after[field] = aNorm;
      result.changed_fields.push(field);
    }
  }
  return result;
}

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

module.exports = { record, diffFields };
