// repositories/adminAuditLogsRepository.js
"use strict";

const pool = require("../config/pool");

function parseMeta(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function create({
  admin_id,
  admin_nome,
  action,
  target_type,
  target_id,
  meta,
  ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO admin_audit_logs
       (admin_id, admin_nome, action, target_type, target_id,
        meta, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      admin_id ?? null,
      admin_nome ?? null,
      action,
      target_type ?? null,
      target_id ?? null,
      meta ? JSON.stringify(meta) : null,
      ip ?? null,
      user_agent ?? null,
    ],
  );
  return result.insertId;
}

/**
 * Fase 7 — scopes agrupam prefixes de action em categorias visíveis
 * no filtro. Ordem dos prefixes não importa (reescrevemos como
 * `action LIKE ? OR action LIKE ?` no WHERE). Mantidos em um mapa
 * exportado para o controller validar o valor recebido.
 */
const SCOPE_PREFIXES = {
  mercado_cafe: ["corretora.", "submission.", "review.", "plan.", "subscription.", "team."],
  monetizacao: ["plan.", "subscription.", "city_promotion."],
  reviews: ["review."],
  planos: ["plan."],
  corretoras: ["corretora.", "submission."],
  assinaturas: ["subscription.", "plan.capabilities_broadcast"],
};

async function list({ action, action_prefix, scope, target_type, target_id, admin_id, page = 1, limit = 50 } = {}) {
  const where = ["1=1"];
  const params = [];

  if (action) {
    where.push("action = ?");
    params.push(action);
  }
  if (action_prefix) {
    where.push("action LIKE ?");
    params.push(`${action_prefix}%`);
  }
  if (scope && SCOPE_PREFIXES[scope]) {
    const prefixes = SCOPE_PREFIXES[scope];
    const placeholders = prefixes.map(() => "action LIKE ?").join(" OR ");
    where.push(`(${placeholders})`);
    params.push(...prefixes.map((p) => `${p}%`));
  }
  if (target_type) {
    where.push("target_type = ?");
    params.push(target_type);
  }
  if (target_id) {
    where.push("target_id = ?");
    params.push(target_id);
  }
  if (admin_id) {
    where.push("admin_id = ?");
    params.push(admin_id);
  }

  const whereClause = where.join(" AND ");

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM admin_audit_logs WHERE ${whereClause}`,
    params,
  );
  const total = Number(countRow.total || 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT *
     FROM admin_audit_logs
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    items: rows.map((r) => ({ ...r, meta: parseMeta(r.meta) })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Lista o histórico completo de uma corretora: ações diretas
 * (target_type='corretora', target_id=corretoraId) + ações sobre a
 * submissão original (target_type='submission', target_id=submissionId)
 * mescladas em ordem cronológica decrescente.
 *
 * Retorna até `limit` registros. `submissionId` pode ser null — nesse
 * caso só traz eventos diretos da corretora.
 */
async function listForCorretora(corretoraId, submissionId, { limit = 50 } = {}) {
  const where = ["(target_type = 'corretora' AND target_id = ?)"];
  const params = [corretoraId];

  if (submissionId) {
    where.push("(target_type = 'submission' AND target_id = ?)");
    params.push(submissionId);
  }

  const sql = `
    SELECT *
    FROM admin_audit_logs
    WHERE ${where.join(" OR ")}
    ORDER BY created_at DESC
    LIMIT ?
  `;
  const [rows] = await pool.query(sql, [...params, limit]);
  return rows.map((r) => ({ ...r, meta: parseMeta(r.meta) }));
}

module.exports = { create, list, listForCorretora, SCOPE_PREFIXES };
