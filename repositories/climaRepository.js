"use strict";

// repositories/climaRepository.js
// Queries do domínio Kavita News — CLIMA (tabela: news_clima)

const db = require("../config/pool");

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows?.[0] || null;
}

const CLIMA_SELECT = `
  SELECT
    id,
    city_name,
    slug,
    uf,
    ibge_id,
    station_code,
    station_name,
    station_uf,
    station_lat,
    station_lon,
    station_distance,
    ibge_source,
    station_source,
    last_sync_observed_at,
    last_sync_forecast_at,
    last_update_at,
    mm_24h,
    mm_7d,
    source,
    ativo
  FROM news_clima
`;

// ─── Admin / Internal ────────────────────────────────────────────────────────

async function getClimaById(id) {
  return queryOne(`${CLIMA_SELECT} WHERE id = ? LIMIT 1`, [id]);
}

async function getClimaBySlug(slug) {
  return queryOne(`${CLIMA_SELECT} WHERE slug = ? LIMIT 1`, [slug]);
}

async function listClima() {
  return query(`${CLIMA_SELECT} ORDER BY ativo DESC, city_name ASC`);
}

async function createClima(data) {
  const payload = {
    city_name: data.city_name ?? null,
    slug: data.slug ?? null,
    uf: data.uf ?? null,

    ibge_id: data.ibge_id ?? null,

    station_code: data.station_code ?? null,
    station_name: data.station_name ?? null,
    station_uf: data.station_uf ?? null,
    station_lat: data.station_lat ?? null,
    station_lon: data.station_lon ?? null,
    station_distance: data.station_distance ?? null,

    ibge_source: data.ibge_source ?? null,
    station_source: data.station_source ?? null,

    last_sync_observed_at: data.last_sync_observed_at ?? null,
    last_sync_forecast_at: data.last_sync_forecast_at ?? null,

    last_update_at: data.last_update_at ?? null,
    mm_24h: data.mm_24h ?? null,
    mm_7d: data.mm_7d ?? null,
    source: data.source ?? null,

    ativo: data.ativo ?? 1,
  };

  const res = await query(
    `
    INSERT INTO news_clima (
      city_name, slug, uf,
      ibge_id,
      station_code, station_name, station_uf,
      station_lat, station_lon, station_distance,
      ibge_source, station_source,
      last_sync_observed_at, last_sync_forecast_at,
      last_update_at,
      mm_24h, mm_7d,
      source,
      ativo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.city_name,
      payload.slug,
      payload.uf,

      payload.ibge_id,

      payload.station_code,
      payload.station_name,
      payload.station_uf,
      payload.station_lat,
      payload.station_lon,
      payload.station_distance,

      payload.ibge_source,
      payload.station_source,

      payload.last_sync_observed_at,
      payload.last_sync_forecast_at,

      payload.last_update_at,
      payload.mm_24h,
      payload.mm_7d,
      payload.source,

      payload.ativo,
    ]
  );

  return { id: res.insertId, ...payload };
}

async function updateClima(id, data) {
  const fields = [];
  const params = [];

  const map = {
    city_name: "city_name",
    slug: "slug",
    uf: "uf",

    ibge_id: "ibge_id",

    station_code: "station_code",
    station_name: "station_name",
    station_uf: "station_uf",
    station_lat: "station_lat",
    station_lon: "station_lon",
    station_distance: "station_distance",

    ibge_source: "ibge_source",
    station_source: "station_source",

    last_sync_observed_at: "last_sync_observed_at",
    last_sync_forecast_at: "last_sync_forecast_at",

    last_update_at: "last_update_at",
    mm_24h: "mm_24h",
    mm_7d: "mm_7d",
    source: "source",

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
    UPDATE news_clima
    SET ${fields.join(", ")}
    WHERE id = ?
    `,
    params
  );

  return { affectedRows: res.affectedRows ?? 0 };
}

async function deleteClima(id) {
  const res = await query("DELETE FROM news_clima WHERE id = ?", [id]);
  return { affectedRows: res.affectedRows ?? 0 };
}

// ─── Public (site, sem autenticação) ─────────────────────────────────────────

async function listClimaPublic() {
  return query(`${CLIMA_SELECT} WHERE ativo = 1 ORDER BY city_name ASC`);
}

async function getClimaPublicBySlug(slug) {
  return queryOne(`${CLIMA_SELECT} WHERE slug = ? AND ativo = 1 LIMIT 1`, [slug]);
}

module.exports = {
  getClimaById,
  getClimaBySlug,
  listClima,
  createClima,
  updateClima,
  deleteClima,
  listClimaPublic,
  getClimaPublicBySlug,
};
