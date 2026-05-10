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

// ─── Column detection ────────────────────────────────────────────────────────
// As colunas de current weather (temperature_c, humidity_pct, wind_kmh,
// condition) são adicionadas pela migration 2026051400000002. Se a migration
// ainda não rodou em algum ambiente, queries não devem referenciá-las.
// Mesmo padrão usado em cotacoesRepository.js para as colunas BRL.

const CURRENT_COLS = ["temperature_c", "humidity_pct", "wind_kmh", "condition"];
let _hasCurrentCols = null; // null = não verificado, true/false = verificado

async function hasCurrentColumns() {
  if (_hasCurrentCols !== null) return _hasCurrentCols;
  try {
    const [cols] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_clima' AND COLUMN_NAME IN (?)",
      [CURRENT_COLS],
    );
    _hasCurrentCols = Array.isArray(cols) && cols.length === CURRENT_COLS.length;
  } catch {
    _hasCurrentCols = false;
  }
  return _hasCurrentCols;
}

const BASE_COLS = `
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
    ativo`;

function buildSelect(withCurrent) {
  if (withCurrent) {
    return `SELECT ${BASE_COLS}, temperature_c, humidity_pct, wind_kmh, \`condition\` FROM news_clima`;
  }
  return `SELECT ${BASE_COLS} FROM news_clima`;
}

async function getClimaSelect() {
  return buildSelect(await hasCurrentColumns());
}

// Mantido para compat com leituras síncronas (não há nenhuma hoje, mas o
// nome existia antes). Usa o select base; se um caller precisar dos campos
// novos, deve passar pelo helper async.
const CLIMA_SELECT = buildSelect(false);

// ─── Admin / Internal ────────────────────────────────────────────────────────

async function getClimaById(id) {
  const sel = await getClimaSelect();
  return queryOne(`${sel} WHERE id = ? LIMIT 1`, [id]);
}

async function getClimaBySlug(slug) {
  const sel = await getClimaSelect();
  return queryOne(`${sel} WHERE slug = ? LIMIT 1`, [slug]);
}

async function listClima() {
  const sel = await getClimaSelect();
  return query(`${sel} ORDER BY ativo DESC, city_name ASC`);
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

  // Campos de current weather só entram no UPDATE se a migration nova
  // já rodou neste ambiente. Caso contrário, ignoramos silenciosamente —
  // o restante do patch (chuva, last_update_at) é aplicado normalmente.
  if (await hasCurrentColumns()) {
    map.temperature_c = "temperature_c";
    map.humidity_pct = "humidity_pct";
    map.wind_kmh = "wind_kmh";
    // `condition` é palavra reservada em alguns dialetos — escapar por segurança.
    map.condition = "`condition`";
  }

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
  const sel = await getClimaSelect();
  return query(`${sel} WHERE ativo = 1 ORDER BY city_name ASC`);
}

async function getClimaPublicBySlug(slug) {
  const sel = await getClimaSelect();
  return queryOne(`${sel} WHERE slug = ? AND ativo = 1 LIMIT 1`, [slug]);
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
  // Auxiliares para teste
  hasCurrentColumns,
};
