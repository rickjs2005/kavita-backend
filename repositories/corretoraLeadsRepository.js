// repositories/corretoraLeadsRepository.js
//
// Acesso à tabela corretora_leads. Todas as queries de leitura
// escopam por corretora_id para evitar vazamento entre corretoras.
"use strict";

const pool = require("../config/pool");

async function create({
  corretora_id,
  nome,
  telefone,
  telefone_normalizado,
  cidade,
  mensagem,
  objetivo,
  tipo_cafe,
  volume_range,
  canal_preferido,
  corrego_localidade,
  safra_tipo,
  source_ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_leads
       (corretora_id, nome, telefone, telefone_normalizado,
        cidade, mensagem, objetivo, tipo_cafe, volume_range,
        canal_preferido, corrego_localidade, safra_tipo,
        source_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      corretora_id,
      nome,
      telefone,
      telefone_normalizado ?? null,
      cidade ?? null,
      mensagem ?? null,
      objetivo ?? null,
      tipo_cafe ?? null,
      volume_range ?? null,
      canal_preferido ?? null,
      corrego_localidade ?? null,
      safra_tipo ?? null,
      source_ip ?? null,
      user_agent ?? null,
    ],
  );
  return result.insertId;
}

async function findByIdForCorretora(id, corretoraId) {
  const [rows] = await pool.query(
    "SELECT * FROM corretora_leads WHERE id = ? AND corretora_id = ? LIMIT 1",
    [id, corretoraId]
  );
  return rows[0] ?? null;
}

async function list({ corretoraId, status, page, limit }) {
  const where = ["corretora_id = ?"];
  const params = [corretoraId];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const whereClause = where.join(" AND ");

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT *
     FROM corretora_leads
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { items: rows, total, page, limit };
}

async function update(id, corretoraId, data) {
  const allowed = ["status", "nota_interna", "amostra_status"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (sets.length === 0) return 0;

  values.push(id, corretoraId);
  const [result] = await pool.query(
    `UPDATE corretora_leads SET ${sets.join(", ")} WHERE id = ? AND corretora_id = ?`,
    values
  );
  return result.affectedRows;
}

/**
 * Marca o timestamp do primeiro response do lead + grava duração em
 * segundos. Usado para SLA tracking (Sprint 3). Só deve ser chamado
 * quando first_response_at ainda for NULL (guard no service).
 */
async function markFirstResponse(leadId, corretoraId, responseSeconds) {
  const [result] = await pool.query(
    `UPDATE corretora_leads
       SET first_response_at = NOW(),
           first_response_seconds = ?
     WHERE id = ? AND corretora_id = ? AND first_response_at IS NULL`,
    [responseSeconds, leadId, corretoraId],
  );
  return result.affectedRows;
}

/**
 * Lista TODOS os leads da corretora sem paginação — uso exclusivo
 * para export CSV. Limite superior hard de 10k para evitar
 * memory issue em casos extremos.
 */
async function listAllForExport(corretoraId, { status } = {}) {
  const where = ["corretora_id = ?"];
  const params = [corretoraId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT *
     FROM corretora_leads
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params,
  );
  return rows;
}

/**
 * Sprint 7 — Busca lead por id sem filtro de corretora (uso público
 * pela rota de confirmação de lote vendido). Usado APENAS após
 * validação de token HMAC.
 */
async function findByIdRaw(id) {
  const [[row]] = await pool.query(
    "SELECT * FROM corretora_leads WHERE id = ? LIMIT 1",
    [id],
  );
  return row ?? null;
}

/**
 * Broadcast de "lote vendido": marca lote_disponivel = 0 em TODOS os
 * leads ativos com mesmo telefone_normalizado. Retorna lista das
 * corretoras afetadas para criar notificações.
 */
async function broadcastLoteVendido(telefoneNormalizado) {
  if (!telefoneNormalizado) return [];

  // 1. Identifica leads alvos antes do update (precisa de corretora_id
  //    pra notificar).
  const [targets] = await pool.query(
    `SELECT id, corretora_id, nome, cidade
     FROM corretora_leads
     WHERE telefone_normalizado = ? AND lote_disponivel = 1`,
    [telefoneNormalizado],
  );

  if (targets.length === 0) return [];

  // 2. Marca todos.
  await pool.query(
    `UPDATE corretora_leads
       SET lote_disponivel = 0
     WHERE telefone_normalizado = ? AND lote_disponivel = 1`,
    [telefoneNormalizado],
  );

  return targets;
}

/**
 * Sprint 7 — Top córregos com mais leads na janela. Usado pelo
 * widget admin "Mapa de córregos ativos".
 */
async function getTopCorregos({ daysBack = 7, limit = 5 } = {}) {
  const [rows] = await pool.query(
    `SELECT
       corrego_localidade AS corrego,
       COUNT(*) AS total,
       SUM(CASE WHEN volume_range IN ('200_500', '500_mais') THEN 1 ELSE 0 END) AS alta_prioridade,
       COUNT(DISTINCT corretora_id) AS corretoras_atingidas,
       MAX(created_at) AS ultimo_lead
     FROM corretora_leads
     WHERE corrego_localidade IS NOT NULL
       AND corrego_localidade != ''
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY corrego_localidade
     ORDER BY total DESC, alta_prioridade DESC
     LIMIT ?`,
    [daysBack, limit],
  );

  return rows.map((r) => ({
    corrego: r.corrego,
    total: Number(r.total),
    alta_prioridade: Number(r.alta_prioridade),
    corretoras_atingidas: Number(r.corretoras_atingidas),
    ultimo_lead: r.ultimo_lead,
  }));
}

async function summary(corretoraId) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM corretora_leads
     WHERE corretora_id = ?
     GROUP BY status`,
    [corretoraId]
  );

  const result = { total: 0, new: 0, contacted: 0, closed: 0, lost: 0 };
  for (const row of rows) {
    const count = Number(row.total || 0);
    result[row.status] = count;
    result.total += count;
  }
  return result;
}

module.exports = {
  create,
  findByIdForCorretora,
  findByIdRaw,
  list,
  listAllForExport,
  update,
  markFirstResponse,
  broadcastLoteVendido,
  getTopCorregos,
  summary,
};
