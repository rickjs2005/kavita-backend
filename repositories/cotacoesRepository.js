"use strict";

// repositories/cotacoesRepository.js
// Queries do domínio Kavita News — COTAÇÕES (tabelas: news_cotacoes, news_cotacoes_history)

const db = require("../config/pool");

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows?.[0] || null;
}

// ─── Column detection ────────────────────────────────────────────────────────
// The BRL conversion columns (original_price, original_currency, exchange_rate)
// are added by migration 2026040600000001. If the migration hasn't run yet,
// queries must not reference them. We detect once at first use and cache.

const BRL_COLS = ["original_price", "original_currency", "exchange_rate"];
let _hasBrlCols = null; // null = not checked, true/false = checked

async function hasBrlColumns() {
  if (_hasBrlCols !== null) return _hasBrlCols;
  try {
    const [cols] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_cotacoes' AND COLUMN_NAME IN (?)",
      [BRL_COLS],
    );
    _hasBrlCols = Array.isArray(cols) && cols.length === BRL_COLS.length;
  } catch {
    _hasBrlCols = false;
  }
  return _hasBrlCols;
}

const BASE_COLS = `
    id, name, slug, group_key, type, price,
    unit, variation_day, market, source,
    last_update_at, last_sync_status, last_sync_message,
    ativo, criado_em, atualizado_em`;

function buildSelect(withBrl) {
  if (withBrl) {
    return `SELECT ${BASE_COLS}, original_price, original_currency, exchange_rate FROM news_cotacoes`;
  }
  return `SELECT ${BASE_COLS} FROM news_cotacoes`;
}

async function getCotacaoSelect() {
  return buildSelect(await hasBrlColumns());
}

// ─── Admin / Internal ────────────────────────────────────────────────────────

async function getCotacaoById(id) {
  const sel = await getCotacaoSelect();
  return queryOne(`${sel} WHERE id = ? LIMIT 1`, [id]);
}

async function getCotacaoBySlug(slug) {
  const sel = await getCotacaoSelect();
  return queryOne(`${sel} WHERE slug = ? LIMIT 1`, [slug]);
}

async function listCotacoes() {
  const sel = await getCotacaoSelect();
  return query(`${sel} ORDER BY ativo DESC, group_key ASC, type ASC, name ASC`);
}

async function cotacoesMeta() {
  const markets = await query(
    "SELECT DISTINCT market FROM news_cotacoes WHERE market IS NOT NULL AND market <> '' ORDER BY market ASC"
  );
  const sources = await query(
    "SELECT DISTINCT source FROM news_cotacoes WHERE source IS NOT NULL AND source <> '' ORDER BY source ASC"
  );
  const units = await query(
    "SELECT DISTINCT unit FROM news_cotacoes WHERE unit IS NOT NULL AND unit <> '' ORDER BY unit ASC"
  );
  const types = await query(
    "SELECT DISTINCT type FROM news_cotacoes WHERE type IS NOT NULL AND type <> '' ORDER BY type ASC"
  );

  return {
    markets: markets.map((r) => r.market),
    sources: sources.map((r) => r.source),
    units: units.map((r) => r.unit),
    types: types.map((r) => r.type),
  };
}

async function createCotacao(data) {
  const payload = {
    name: data.name ?? null,
    slug: data.slug ?? null,
    group_key: data.group_key ?? "graos",
    type: data.type ?? null,

    price: data.price ?? null,
    unit: data.unit ?? null,
    variation_day: data.variation_day ?? null,
    market: data.market ?? null,
    source: data.source ?? null,

    last_update_at: data.last_update_at ?? null,

    last_sync_status: data.last_sync_status ?? null,
    last_sync_message: data.last_sync_message ?? null,

    ativo: data.ativo ?? 1,
  };

  const res = await query(
    `
    INSERT INTO news_cotacoes (
      name, slug,
      group_key,
      type,
      price, unit, variation_day,
      market, source,
      last_update_at,
      last_sync_status, last_sync_message,
      ativo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.slug,

      payload.group_key,
      payload.type,

      payload.price,
      payload.unit,
      payload.variation_day,

      payload.market,
      payload.source,

      payload.last_update_at,

      payload.last_sync_status,
      payload.last_sync_message,

      payload.ativo,
    ]
  );

  return { id: res.insertId, ...payload };
}

async function updateCotacao(id, data) {
  const fields = [];
  const params = [];

  const withBrl = await hasBrlColumns();

  const map = {
    name: "name",
    slug: "slug",
    group_key: "group_key",
    type: "type",
    price: "price",
    ...(withBrl ? {
      original_price: "original_price",
      original_currency: "original_currency",
      exchange_rate: "exchange_rate",
    } : {}),
    unit: "unit",
    variation_day: "variation_day",
    market: "market",
    source: "source",
    last_update_at: "last_update_at",
    last_sync_status: "last_sync_status",
    last_sync_message: "last_sync_message",
    ativo: "ativo",
  };

  for (const [k, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      fields.push(`${col} = ?`);
      params.push(data[k]);
    }
  }

  if (!fields.length) return { affectedRows: 0 };

  params.push(id);

  const res = await query(
    `
    UPDATE news_cotacoes
    SET ${fields.join(", ")}
    WHERE id = ?
    `,
    params
  );

  return { affectedRows: res.affectedRows ?? 0 };
}

async function deleteCotacao(id) {
  const res = await query("DELETE FROM news_cotacoes WHERE id = ?", [id]);
  return { affectedRows: res.affectedRows ?? 0 };
}

async function insertCotacaoHistory({
  cotacao_id,
  price,
  variation_day,
  source,
  observed_at,
  sync_status,
  sync_message,
}) {
  const payload = {
    cotacao_id: cotacao_id ?? null,
    price: price ?? null,
    variation_day: variation_day ?? null,
    source: source ?? null,
    observed_at: observed_at ?? null,
    sync_status: sync_status ?? null,
    sync_message: sync_message ?? null,
  };

  const res = await query(
    `
    INSERT INTO news_cotacoes_history (
      cotacao_id,
      price,
      variation_day,
      source,
      observed_at,
      sync_status,
      sync_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.cotacao_id,
      payload.price,
      payload.variation_day,
      payload.source,
      payload.observed_at,
      payload.sync_status,
      payload.sync_message,
    ]
  );

  return { id: res.insertId, ...payload };
}

// ─── History (public read) ───────────────────────────────────────────────────

/**
 * Returns the most recent history entries for a cotação (public).
 *
 * Filters:
 * - sync_status = 'ok' (exclude errors)
 * - price IS NOT NULL (exclude empty syncs)
 * - created_at within last 7 days (exclude pre-BRL-conversion legacy data
 *   that was stored in USD/cents and is not comparable to current BRL values)
 */
async function listCotacaoHistoryPublic(cotacaoId, limit = 10) {
  return query(
    `SELECT id, price, variation_day, source, observed_at, created_at
     FROM news_cotacoes_history
     WHERE cotacao_id = ?
       AND sync_status = 'ok'
       AND price IS NOT NULL
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY created_at DESC
     LIMIT ?`,
    [cotacaoId, limit],
  );
}

/**
 * Batch público: retorna histórico de várias cotações em uma única query.
 *
 * Uso na home /news: o card CotacaoMini precisa de sparkline para 4-8
 * cotações de uma vez — fazer N requisições seria desperdício. Esse endpoint
 * casa news_cotacoes (filtra ativo=1 + slugs informados) com news_cotacoes_history
 * (mesmos filtros do endpoint singular: sync_status='ok', price NOT NULL,
 * últimos 7 dias) e devolve um mapa { slug: [pontos...] }.
 *
 * `limitPerSlug` controla quantos pontos por cotação (default 24, max 50).
 *
 * Não substitui o endpoint singular — apenas complementa para uso em listas.
 */
async function listCotacoesHistoryPublicBatch(slugs, limitPerSlug = 24) {
  if (!Array.isArray(slugs) || slugs.length === 0) return {};

  const safeLimit = Math.min(Math.max(Number(limitPerSlug) || 24, 1), 50);

  // Estratégia: pega TODOS os pontos das últimas 7 dias para os slugs ativos
  // e particiona em JS. Para um conjunto pequeno (≤ 8 slugs), isso é mais
  // simples e rápido que ROW_NUMBER() OVER PARTITION (que exige MySQL 8+ e
  // complica leitura). Se o uso crescer, vale migrar para window function.
  const placeholders = slugs.map(() => "?").join(",");

  const rows = await query(
    `
    SELECT
      c.slug         AS slug,
      h.id           AS id,
      h.price        AS price,
      h.variation_day AS variation_day,
      h.source       AS source,
      h.observed_at  AS observed_at,
      h.created_at   AS created_at
    FROM news_cotacoes_history h
    INNER JOIN news_cotacoes c ON c.id = h.cotacao_id
    WHERE c.ativo = 1
      AND c.slug IN (${placeholders})
      AND h.sync_status = 'ok'
      AND h.price IS NOT NULL
      AND h.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY c.slug ASC, h.created_at DESC
    `,
    slugs,
  );

  // Agrupa por slug e aplica o limite por grupo (mais recentes primeiro,
  // mas o sparkline desenha em ordem cronológica — o frontend faz reverse).
  const bySlug = {};
  for (const row of rows) {
    if (!bySlug[row.slug]) bySlug[row.slug] = [];
    if (bySlug[row.slug].length < safeLimit) {
      bySlug[row.slug].push({
        id: row.id,
        price: row.price,
        variation_day: row.variation_day,
        source: row.source,
        observed_at: row.observed_at,
        created_at: row.created_at,
      });
    }
  }

  return bySlug;
}

// ─── Public (site, sem autenticação) ─────────────────────────────────────────

async function listCotacoesPublic({ group_key } = {}) {
  const sel = await getCotacaoSelect();
  const where = ["ativo = 1"];
  const params = [];

  if (group_key) {
    where.push("group_key = ?");
    params.push(group_key);
  }

  return query(
    `
    ${sel}
    WHERE ${where.join(" AND ")}
    ORDER BY group_key ASC, type ASC, name ASC
    `,
    params
  );
}

async function getCotacaoPublicBySlug(slug) {
  const sel = await getCotacaoSelect();
  return queryOne(`${sel} WHERE slug = ? AND ativo = 1 LIMIT 1`, [slug]);
}

module.exports = {
  getCotacaoById,
  getCotacaoBySlug,
  listCotacoes,
  cotacoesMeta,
  createCotacao,
  updateCotacao,
  deleteCotacao,
  insertCotacaoHistory,
  listCotacaoHistoryPublic,
  listCotacoesHistoryPublicBatch,
  listCotacoesPublic,
  getCotacaoPublicBySlug,
};
