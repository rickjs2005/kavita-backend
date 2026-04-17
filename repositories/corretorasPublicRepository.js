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
// SLA médio de primeira resposta: AVG(first_response_seconds) dos
// últimos N leads respondidos. Filtramos só os que têm first_response_at
// (= foram respondidos) para não inflar com leads em aberto.
// Exibe "Responde em média Xh" na vitrine quando há >= 5 respondidos.
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
  ) AS reviews_avg,
  (
    SELECT AVG(l.first_response_seconds) FROM corretora_leads l
    WHERE l.corretora_id = c.id
      AND l.first_response_seconds IS NOT NULL
  ) AS sla_avg_seconds,
  (
    SELECT COUNT(*) FROM corretora_leads l
    WHERE l.corretora_id = c.id
      AND l.first_response_seconds IS NOT NULL
  ) AS sla_sample_count
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
  // SLA: AVG retorna string, sample_count retorna BigInt/string
  // dependendo do driver. Normaliza para number.
  if (row.sla_avg_seconds != null) {
    row.sla_avg_seconds = Math.round(Number(row.sla_avg_seconds));
  }
  if (row.sla_sample_count != null) {
    row.sla_sample_count = Number(row.sla_sample_count);
  }
  return row;
}

/**
 * List active corretoras with optional filters and pagination.
 * Featured corretoras come first, then sorted by sort_order, name.
 */
async function list({ city, featured, search, page, limit }) {
  const where = ["c.status = 'active'", "c.deleted_at IS NULL"];
  const params = [];

  if (city) {
    where.push("c.city = ?");
    params.push(city);
  }

  if (featured === "1") {
    where.push("c.is_featured = 1");
  }

  if (search) {
    // COLLATE utf8mb4_general_ci é accent-insensitive em MySQL: permite
    // matchear "manhuacu" com "Manhuaçu" (case + acentos). A coluna
    // em si já deve ser utf8mb4, então o cast só é cosmético — mas
    // garante o comportamento mesmo se alguma coluna vier com collation
    // case-sensitive herdada de migração antiga.
    where.push(
      "(c.name LIKE ? COLLATE utf8mb4_general_ci OR c.city LIKE ? COLLATE utf8mb4_general_ci)",
    );
    const term = `%${search}%`;
    params.push(term, term);
  }

  const whereClause = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM corretoras c WHERE ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  // COALESCE estabiliza a ordenação quando sort_order está NULL para
  // corretoras antigas (antes de sort_order existir). Sem o fallback,
  // MySQL ordenava NULLs primeiro e embaralhava a vitrine a cada query.
  const dataSql = `
    SELECT ${SELECT_COLUMNS}
    FROM corretoras c
    WHERE ${whereClause}
    ORDER BY c.is_featured DESC, COALESCE(c.sort_order, 999999) ASC, c.name ASC
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
    WHERE c.slug = ? AND c.status = 'active' AND c.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [slug]);
  return normalizeRow(rows[0]) ?? null;
}

/**
 * Lookup por id na camada pública. Mesmo filtro de status/deleted_at
 * que findBySlug — usado pelo endpoint público de status de lead
 * para evitar vazar dados de corretora arquivada/inativa ao produtor.
 */
async function findById(id) {
  const sql = `
    SELECT ${SELECT_COLUMNS}, c.status
    FROM corretoras c
    WHERE c.id = ? AND c.status = 'active' AND c.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [id]);
  return normalizeRow(rows[0]) ?? null;
}

/**
 * List distinct cities that have active corretoras — used for filters.
 */
async function listCities() {
  const sql = `
    SELECT DISTINCT c.city
    FROM corretoras c
    WHERE c.status = 'active' AND c.deleted_at IS NULL
    ORDER BY c.city ASC
  `;
  const [rows] = await pool.query(sql);
  return rows.map((r) => r.city);
}

module.exports = {
  list,
  findBySlug,
  findById,
  listCities,
};
