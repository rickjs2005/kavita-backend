// repositories/corretorasPublicRepository.js
//
// Public read-only queries for corretoras.
// Pair: corretorasAdminRepository.js (admin CRUD + submissions).
"use strict";

const pool = require("../config/pool");

// Campos JSON armazenados como string no MySQL — precisam ser parsed
// no momento da leitura pública. Fonte: corretorasAdminRepository
// (JSON_FIELDS). Se parse falhar, devolvemos null sem quebrar a
// listagem — registros antigos podem ter valor malformado.
const JSON_FIELDS = ["cidades_atendidas", "tipos_cafe"];

function parseJsonFields(row) {
  if (!row) return row;
  for (const field of JSON_FIELDS) {
    const raw = row[field];
    if (raw == null) continue;
    if (typeof raw === "string") {
      try {
        row[field] = JSON.parse(raw);
      } catch {
        row[field] = null;
      }
    }
    // Se o driver já devolve objeto (JSON nativo do MySQL 5.7+), mantém.
  }
  return row;
}

// Colunas públicas da corretora + agregado de reviews (approved only).
// Usamos subquery em vez de JOIN+GROUP BY para preservar a paginação
// simples do list() sem DISTINCT, e o índice idx_reviews_corretora_status
// cobre a subquery.
const SELECT_COLUMNS = `
  c.id, c.name, c.slug, c.contact_name, c.description, c.logo_path,
  c.city, c.state, c.region, c.phone, c.whatsapp, c.email,
  c.website, c.instagram, c.facebook, c.is_featured,
  c.cidades_atendidas, c.tipos_cafe, c.perfil_compra,
  c.horario_atendimento, c.anos_atuacao, c.foto_responsavel_path,
  (
    SELECT COUNT(*) FROM corretora_reviews r
    WHERE r.corretora_id = c.id AND r.status = 'approved'
  ) AS reviews_count,
  (
    SELECT AVG(r.rating) FROM corretora_reviews r
    WHERE r.corretora_id = c.id AND r.status = 'approved'
  ) AS reviews_avg
`;

function normalizeRow(row) {
  if (!row) return row;
  parseJsonFields(row);
  // reviews_avg vem como string do MySQL (AVG). Converte para número
  // com 2 casas; null se não há reviews aprovadas.
  if (row.reviews_avg != null) {
    row.reviews_avg = Number(Number(row.reviews_avg).toFixed(2));
  }
  if (row.reviews_count != null) {
    row.reviews_count = Number(row.reviews_count);
  }
  return row;
}

/**
 * List active corretoras with optional filters and pagination.
 * Featured corretoras come first, then sorted by sort_order, name.
 */
async function list({ city, featured, search, page, limit }) {
  const where = ["c.status = 'active'"];
  const params = [];

  if (city) {
    where.push("c.city = ?");
    params.push(city);
  }

  if (featured === "1") {
    where.push("c.is_featured = 1");
  }

  if (search) {
    where.push("(c.name LIKE ? OR c.city LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term);
  }

  const whereClause = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM corretoras c WHERE ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const dataSql = `
    SELECT ${SELECT_COLUMNS}
    FROM corretoras c
    WHERE ${whereClause}
    ORDER BY c.is_featured DESC, c.sort_order ASC, c.name ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  return { items: rows.map(normalizeRow), total, page, limit };
}

/**
 * Get a single active corretora by slug.
 *
 * IMPORTANTE: inclui `status` no SELECT. Historicamente esta coluna
 * era omitida (o WHERE já filtra status='active', então a coluna
 * parecia redundante). Mas consumidores downstream — em particular
 * corretoraLeadsService.createLeadFromPublic — fazem checagens
 * defensivas do tipo `if (corretora.status !== "active")`. Sem a
 * coluna no SELECT, `status` era `undefined` e a checagem sempre
 * falhava, resultando em 409 "Esta corretora não está recebendo
 * contatos no momento." para corretoras que DE FATO estão ativas.
 * Expor o campo resolve o contrato de forma explícita.
 */
async function findBySlug(slug) {
  const sql = `
    SELECT ${SELECT_COLUMNS}, c.status
    FROM corretoras c
    WHERE c.slug = ? AND c.status = 'active'
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [slug]);
  return normalizeRow(rows[0]) ?? null;
}

/**
 * List distinct cities that have active corretoras — used for filters.
 */
async function listCities() {
  const sql = `
    SELECT DISTINCT c.city
    FROM corretoras c
    WHERE c.status = 'active'
    ORDER BY c.city ASC
  `;
  const [rows] = await pool.query(sql);
  return rows.map((r) => r.city);
}

module.exports = {
  list,
  findBySlug,
  listCities,
};
