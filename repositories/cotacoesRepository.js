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

const COTACAO_SELECT = `
  SELECT
    id,
    name,
    slug,
    group_key,
    type,
    price,
    unit,
    variation_day,
    market,
    source,
    last_update_at,
    last_sync_status,
    last_sync_message,
    ativo,
    criado_em,
    atualizado_em
  FROM news_cotacoes
`;

// ─── Admin / Internal ────────────────────────────────────────────────────────

async function getCotacaoById(id) {
  return queryOne(`${COTACAO_SELECT} WHERE id = ? LIMIT 1`, [id]);
}

async function getCotacaoBySlug(slug) {
  return queryOne(`${COTACAO_SELECT} WHERE slug = ? LIMIT 1`, [slug]);
}

async function listCotacoes() {
  return query(`${COTACAO_SELECT} ORDER BY ativo DESC, group_key ASC, type ASC, name ASC`);
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

  const map = {
    name: "name",
    slug: "slug",
    group_key: "group_key",
    type: "type",
    price: "price",
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

// ─── Public (site, sem autenticação) ─────────────────────────────────────────

async function listCotacoesPublic({ group_key } = {}) {
  const where = ["ativo = 1"];
  const params = [];

  if (group_key) {
    where.push("group_key = ?");
    params.push(group_key);
  }

  return query(
    `
    ${COTACAO_SELECT}
    WHERE ${where.join(" AND ")}
    ORDER BY group_key ASC, type ASC, name ASC
    `,
    params
  );
}

async function getCotacaoPublicBySlug(slug) {
  return queryOne(`${COTACAO_SELECT} WHERE slug = ? AND ativo = 1 LIMIT 1`, [slug]);
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
  listCotacoesPublic,
  getCotacaoPublicBySlug,
};
