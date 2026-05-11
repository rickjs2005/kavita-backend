// repositories/contractAuditLogRepository.js
//
// Append-only sobre `contract_audit_log` (Fase 10.5).
//
// Por design, este repository expõe APENAS create + list. Sem update,
// sem delete — a tabela é a fonte jurídica do ciclo de vida do
// contrato. Se uma linha precisar ser corrigida (ex.: payload errado
// gravado por bug), o caminho é gravar uma NOVA linha com payload
// corretivo, não mutar a anterior.
"use strict";

const pool = require("../config/pool");

function _parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function _hydrate(row) {
  if (!row) return null;
  return { ...row, payload: _parseJsonField(row.payload) };
}

/**
 * Insere um evento de auditoria. Retorna o id gerado.
 *
 * Caller é responsável por garantir consistência dos campos
 * (event_type, actor_type devem ser valores válidos do ENUM do banco).
 * O service contractAuditLogService valida no nível JS antes de chegar
 * aqui, mas o banco também rejeitará valores fora do ENUM.
 */
async function createEvent(data, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO contract_audit_log
       (contrato_id, corretora_id, lead_id, event_type, actor_type,
        actor_id, ip, user_agent, previous_status, new_status,
        provider, provider_document_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.contrato_id,
      data.corretora_id ?? null,
      data.lead_id ?? null,
      data.event_type,
      data.actor_type,
      data.actor_id ?? null,
      data.ip ?? null,
      data.user_agent ? String(data.user_agent).slice(0, 500) : null,
      data.previous_status ?? null,
      data.new_status ?? null,
      data.provider ?? null,
      data.provider_document_id ?? null,
      data.payload ? JSON.stringify(data.payload) : null,
    ],
  );
  return result.insertId;
}

/**
 * Timeline de um contrato — mais recente primeiro. Usado pelo admin
 * e potencialmente por endpoint dedicado da corretora.
 */
async function listByContratoId(contratoId, { limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const [rows] = await pool.query(
    `SELECT *
       FROM contract_audit_log
      WHERE contrato_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [contratoId, safeLimit],
  );
  return rows.map(_hydrate);
}

/**
 * Listagem com filtros para admin. Suporta filtro por corretora_id,
 * lead_id e event_type. Paginação simples (page, limit).
 *
 * Retorna { items, page, limit, total } — total via COUNT(*) na mesma
 * query base. Em volumes altos pode ser necessário cache; por ora,
 * a auditoria não é hot path.
 */
async function listForAdmin({
  corretoraId,
  leadId,
  contratoId,
  eventType,
  page = 1,
  limit = 50,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (Number.isInteger(corretoraId)) {
    where.push("corretora_id = ?");
    params.push(corretoraId);
  }
  if (Number.isInteger(leadId)) {
    where.push("lead_id = ?");
    params.push(leadId);
  }
  if (Number.isInteger(contratoId)) {
    where.push("contrato_id = ?");
    params.push(contratoId);
  }
  if (eventType) {
    where.push("event_type = ?");
    params.push(eventType);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM contract_audit_log ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT *
       FROM contract_audit_log
       ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset],
  );
  return {
    items: rows.map(_hydrate),
    page: safePage,
    limit: safeLimit,
    total: Number(total) || 0,
  };
}

module.exports = {
  createEvent,
  listByContratoId,
  listForAdmin,
};
