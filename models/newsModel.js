// models/newsModel.js
// Centraliza queries do módulo Kavita News (clima, cotações, posts)

const db = require("../config/pool");

function clampInt(v, def, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function normalizeLike(s) {
  if (!s) return null;
  return String(s).trim().replace(/[%_]/g, (m) => `\\${m}`);
}

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows?.[0] || null;
}

/* =========================
   CLIMA
========================= */

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
  const res = await query(`DELETE FROM news_clima WHERE id = ?`, [id]);
  return { affectedRows: res.affectedRows ?? 0 };
}

/* =========================
   COTAÇÕES
========================= */

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
    `SELECT DISTINCT market FROM news_cotacoes WHERE market IS NOT NULL AND market <> '' ORDER BY market ASC`
  );
  const sources = await query(
    `SELECT DISTINCT source FROM news_cotacoes WHERE source IS NOT NULL AND source <> '' ORDER BY source ASC`
  );
  const units = await query(
    `SELECT DISTINCT unit FROM news_cotacoes WHERE unit IS NOT NULL AND unit <> '' ORDER BY unit ASC`
  );
  const types = await query(
    `SELECT DISTINCT type FROM news_cotacoes WHERE type IS NOT NULL AND type <> '' ORDER BY type ASC`
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
  const res = await query(`DELETE FROM news_cotacoes WHERE id = ?`, [id]);
  return { affectedRows: res.affectedRows ?? 0 };
}

/* =========================
   HISTÓRICO DE COTAÇÕES
========================= */

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

/* =========================
   POSTS
========================= */

const POST_SELECT = `
  SELECT
    id,
    title,
    slug,
    excerpt,
    content,
    cover_image_url,
    category,
    tags,
    status,
    published_at,
    author_admin_id,
    views,
    ativo,
    criado_em,
    atualizado_em
  FROM news_posts
`;

async function getPostById(id) {
  return queryOne(`${POST_SELECT} WHERE id = ? LIMIT 1`, [id]);
}

async function getPostBySlug(slug) {
  return queryOne(`${POST_SELECT} WHERE slug = ? LIMIT 1`, [slug]);
}

async function listPosts({ status, search, limit, offset }) {
  const where = [];
  const params = [];

  if (status) {
    where.push(`status = ?`);
    params.push(status);
  }

  const like = normalizeLike(search);
  if (like) {
    where.push(`(title LIKE ? ESCAPE '\\\\' OR slug LIKE ? ESCAPE '\\\\')`);
    params.push(`%${like}%`, `%${like}%`);
  }

  const lim = clampInt(limit, 20, 1, 200);
  const off = clampInt(offset, 0, 0, 1000000);

  const sql = `
    ${POST_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY criado_em DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  return query(sql, [...params, lim, off]);
}

async function createPost(data) {
  const payload = {
    title: data.title ?? null,
    slug: data.slug ?? null,
    excerpt: data.excerpt ?? null,
    content: data.content ?? null,
    cover_image_url: data.cover_image_url ?? null,
    category: data.category ?? null,
    tags: data.tags ?? null,
    status: data.status ?? "draft",
    published_at: data.published_at ?? null,
    author_admin_id: data.author_admin_id ?? null,
    ativo: data.ativo ?? 1,
  };

  const res = await query(
    `
    INSERT INTO news_posts (
      title, slug, excerpt, content,
      cover_image_url, category, tags,
      status, published_at,
      author_admin_id,
      ativo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.title,
      payload.slug,
      payload.excerpt,
      payload.content,
      payload.cover_image_url,
      payload.category,
      payload.tags,
      payload.status,
      payload.published_at,
      payload.author_admin_id,
      payload.ativo,
    ]
  );

  return { id: res.insertId, ...payload };
}

async function updatePost(id, data) {
  const fields = [];
  const params = [];

  const map = {
    title: "title",
    slug: "slug",
    excerpt: "excerpt",
    content: "content",
    cover_image_url: "cover_image_url",
    category: "category",
    tags: "tags",
    status: "status",
    published_at: "published_at",
    author_admin_id: "author_admin_id",
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
    UPDATE news_posts
    SET ${fields.join(", ")}
    WHERE id = ?
    `,
    params
  );

  return { affectedRows: res.affectedRows ?? 0 };
}

async function deletePost(id) {
  const res = await query(`DELETE FROM news_posts WHERE id = ?`, [id]);
  return { affectedRows: res.affectedRows ?? 0 };
}

/* =========================
   PUBLIC HELPERS (NOVO)
   - Protege o site: só expõe ativo=1 e posts publicados
========================= */

// CLIMA público
async function listClimaPublic() {
  return query(`${CLIMA_SELECT} WHERE ativo = 1 ORDER BY city_name ASC`);
}

async function getClimaPublicBySlug(slug) {
  return queryOne(`${CLIMA_SELECT} WHERE slug = ? AND ativo = 1 LIMIT 1`, [slug]);
}

// Cotações público
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

// Posts público
async function listPostsPublic({ limit = 10, offset = 0 } = {}) {
  const lim = clampInt(limit, 10, 1, 50);
  const off = clampInt(offset, 0, 0, 1000000);

  return query(
    `
    ${POST_SELECT}
    WHERE status = 'published' AND (ativo = 1 OR ativo IS NULL)
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [lim, off]
  );
}

async function getPostPublicBySlug(slug) {
  return queryOne(
    `
    ${POST_SELECT}
    WHERE slug = ? AND status = 'published' AND (ativo = 1 OR ativo IS NULL)
    LIMIT 1
    `,
    [slug]
  );
}

module.exports = {
  // Clima (admin/internal)
  getClimaById,
  getClimaBySlug,
  listClima,
  createClima,
  updateClima,
  deleteClima,

  // Cotações (admin/internal)
  getCotacaoById,
  getCotacaoBySlug,
  listCotacoes,
  createCotacao,
  updateCotacao,
  deleteCotacao,
  cotacoesMeta,

  // Histórico
  insertCotacaoHistory,

  // Posts (admin/internal)
  getPostById,
  getPostBySlug,
  listPosts,
  createPost,
  updatePost,
  deletePost,

  // Público (NOVO)
  listClimaPublic,
  getClimaPublicBySlug,
  listCotacoesPublic,
  getCotacaoPublicBySlug,
  listPostsPublic,
  getPostPublicBySlug,
};
