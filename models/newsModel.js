// models/newsModel.js
// Centraliza todas as queries SQL do módulo Kavita News.
//
// Requisitos atendidos:
// - Clima: get/list/create/update/delete
// - Cotações: get/list/create/update/delete
// - Posts: list public/admin, get by slug, create/update/delete, publish/unpublish (opcional)

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

async function getClimaBySlug(slug) {
  return queryOne(
    `
    SELECT id, city_name, slug, uf, mm_24h, mm_7d, source, last_update_at, ativo, criado_em, atualizado_em
    FROM news_clima
    WHERE slug = ?
    LIMIT 1
    `,
    [slug]
  );
}

async function listClima() {
  return query(
    `
    SELECT id, city_name, slug, uf, mm_24h, mm_7d, source, last_update_at, ativo, criado_em, atualizado_em
    FROM news_clima
    ORDER BY ativo DESC, city_name ASC
    `
  );
}

async function createClima(data) {
  const payload = {
    city_name: data.city_name ?? null,
    slug: data.slug ?? null,
    uf: data.uf ?? null,
    mm_24h: data.mm_24h ?? null,
    mm_7d: data.mm_7d ?? null,
    source: data.source ?? null,
    last_update_at: data.last_update_at ?? null,
    ativo: data.ativo ?? 1,
  };

  const res = await query(
    `
    INSERT INTO news_clima (city_name, slug, uf, mm_24h, mm_7d, source, last_update_at, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.city_name,
      payload.slug,
      payload.uf,
      payload.mm_24h,
      payload.mm_7d,
      payload.source,
      payload.last_update_at,
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
    mm_24h: "mm_24h",
    mm_7d: "mm_7d",
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

async function getCotacaoBySlug(slug) {
  return queryOne(
    `
    SELECT id, name, slug, type, price, unit, variation_day, market, source, last_update_at, ativo, criado_em, atualizado_em
    FROM news_cotacoes
    WHERE slug = ?
    LIMIT 1
    `,
    [slug]
  );
}

async function listCotacoes() {
  return query(
    `
    SELECT id, name, slug, type, price, unit, variation_day, market, source, last_update_at, ativo, criado_em, atualizado_em
    FROM news_cotacoes
    ORDER BY ativo DESC, type ASC, name ASC
    `
  );
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
    INSERT INTO news_cotacoes (name, slug, type, price, unit, variation_day, market, source, last_update_at, ativo)
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

async function listPostsPublic({ status = "published", limit = 10, offset = 0 } = {}) {
  const lim = clampInt(limit, 10, 1, 50);
  const off = clampInt(offset, 0, 0, 100000);

  const rows = await query(
    `
    SELECT
      id, title, slug, excerpt, cover_image_url, category, tags,
      status, published_at, views, criado_em, atualizado_em
    FROM news_posts
    WHERE status = ?
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [status, lim, off]
  );

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM news_posts WHERE status = ?`,
    [status]
  );

  return {
    rows,
    meta: { status, limit: lim, offset: off, total: Number(totalRow?.total || 0) },
  };
}

async function getPostBySlug(slug) {
  return queryOne(
    `
    SELECT
      id, title, slug, excerpt, content, cover_image_url,
      category, tags, status, published_at, author_admin_id,
      views, criado_em, atualizado_em
    FROM news_posts
    WHERE slug = ?
    LIMIT 1
    `,
    [slug]
  );
}

async function listPostsAdmin({ status, limit = 20, offset = 0, search } = {}) {
  const lim = clampInt(limit, 20, 1, 100);
  const off = clampInt(offset, 0, 0, 100000);

  const where = [];
  const params = [];

  if (status) {
    where.push(`p.status = ?`);
    params.push(status);
  }

  const q = normalizeLike(search);
  if (q) {
    where.push(`(p.title LIKE ? ESCAPE '\\\\' OR p.excerpt LIKE ? ESCAPE '\\\\' OR p.content LIKE ? ESCAPE '\\\\')`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      p.id, p.title, p.slug, p.excerpt, p.cover_image_url, p.category, p.tags,
      p.status, p.published_at, p.author_admin_id, p.views, p.criado_em, p.atualizado_em,
      a.nome AS author_nome, a.email AS author_email
    FROM news_posts p
    LEFT JOIN admins a ON a.id = p.author_admin_id
    ${whereSql}
    ORDER BY
      (p.status = 'published') DESC,
      p.published_at DESC,
      p.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, lim, off]
  );

  const totalRow = await queryOne(
    `
    SELECT COUNT(*) AS total
    FROM news_posts p
    ${whereSql}
    `,
    params
  );

  return {
    rows,
    meta: { status: status || null, search: search || null, limit: lim, offset: off, total: Number(totalRow?.total || 0) },
  };
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
  };

  const res = await query(
    `
    INSERT INTO news_posts
      (title, slug, excerpt, content, cover_image_url, category, tags, status, published_at, author_admin_id)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    views: "views",
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

async function publishPost(id) {
  const res = await query(
    `
    UPDATE news_posts
    SET status = 'published', published_at = COALESCE(published_at, NOW())
    WHERE id = ?
    `,
    [id]
  );
  return { affectedRows: res.affectedRows ?? 0 };
}

async function unpublishPost(id) {
  const res = await query(
    `
    UPDATE news_posts
    SET status = 'draft', published_at = NULL
    WHERE id = ?
    `,
    [id]
  );
  return { affectedRows: res.affectedRows ?? 0 };
}

module.exports = {
  // clima
  getClimaBySlug,
  listClima,
  createClima,
  updateClima,
  deleteClima,

  // cotacoes
  getCotacaoBySlug,
  listCotacoes,
  createCotacao,
  updateCotacao,
  deleteCotacao,

  // posts
  listPostsPublic,
  getPostBySlug,
  listPostsAdmin,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
};
