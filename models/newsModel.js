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
    type,
    price,
    unit,
    variation_day,
    market,
    source,
    last_update_at,
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
  return query(`${COTACAO_SELECT} ORDER BY ativo DESC, type ASC, name ASC`);
}

async function createCotacao(data) {
  const payload = {
    name: data.name ?? null,
    slug: data.slug ?? null,
    type: data.type ?? null,
    price: data.price ?? null,
    unit: data.unit ?? null,
    variation_day: data.variation_day ?? null,
    market: data.market ?? null,
    source: data.source ?? null,
    last_update_at: data.last_update_at ?? null,
    ativo: data.ativo ?? 1,
  };

  const res = await query(
    `
    INSERT INTO news_cotacoes (
      name, slug, type,
      price, unit, variation_day,
      market, source,
      last_update_at,
      ativo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.slug,
      payload.type,
      payload.price,
      payload.unit,
      payload.variation_day,
      payload.market,
      payload.source,
      payload.last_update_at,
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
    type: "type",
    price: "price",
    unit: "unit",
    variation_day: "variation_day",
    market: "market",
    source: "source",
    last_update_at: "last_update_at",
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

module.exports = {
  // Clima
  getClimaById,
  getClimaBySlug,
  listClima,
  createClima,
  updateClima,
  deleteClima,

  // Cotações
  getCotacaoById,
  getCotacaoBySlug,
  listCotacoes,
  createCotacao,
  updateCotacao,
  deleteCotacao,

  // Posts
  getPostById,
  getPostBySlug,
  listPosts,
  createPost,
  updatePost,
  deletePost,
};
