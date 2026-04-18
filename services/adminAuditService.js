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
// ETAPA 2.5 — limite de tamanho por valor no audit. Descrição longa,
// JSON de capabilities inflado ou lista de cidades inteira são comuns;
// se persistirmos o valor cru, `admin_audit_logs.meta` cresce rápido.
// O truncate é marcador explícito — não é hash porque admin precisa
// ler o início pra investigar.
const AUDIT_TRUNCATE_MAX = 500;

function truncateForAudit(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length <= AUDIT_TRUNCATE_MAX) return value;
    return `${value.slice(0, AUDIT_TRUNCATE_MAX)}… (truncado ${value.length - AUDIT_TRUNCATE_MAX} caracteres)`;
  }
  if (typeof value === "object") {
    // JSON-stringify o valor e aplica o mesmo limite. Devolve como
    // STRING com sufixo — o admin vê o JSON inicial e entende que
    // houve truncate. Não reconstroi o objeto (evita inventar dados).
    const stringified = JSON.stringify(value);
    if (stringified.length <= AUDIT_TRUNCATE_MAX) return value;
    return `${stringified.slice(0, AUDIT_TRUNCATE_MAX)}… (truncado)`;
  }
  return value;
}

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
      // Truncate ANTES de gravar — diff é sempre enxuto.
      result.before[field] = truncateForAudit(bNorm);
      result.after[field] = truncateForAudit(aNorm);
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

module.exports = { record, diffFields, truncateForAudit, AUDIT_TRUNCATE_MAX };
