"use strict";

const pool = require("../config/pool");

// ─── news_posts ─────────────────────────────────────────────────────────────

const POST_COLS = `
  id, title, slug, excerpt, content, cover_image_url, category, tags, status,
  published_at, author_admin_id, views, criado_em, atualizado_em
`;

async function slugExists(slug) {
  const [[row]] = await pool.query(
    "SELECT 1 AS ok FROM news_posts WHERE slug = ? LIMIT 1",
    [slug]
  );
  return !!row?.ok;
}

async function slugExistsExcept(slug, excludeId) {
  const [[row]] = await pool.query(
    "SELECT id FROM news_posts WHERE slug = ? AND id <> ? LIMIT 1",
    [slug, excludeId]
  );
  return !!row?.id;
}

async function countPosts(whereSql, params) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM news_posts ${whereSql}`,
    params
  );
  return Number(row?.total || 0);
}

async function listPosts(whereSql, params, limit, offset) {
  const [rows] = await pool.query(
    `SELECT ${POST_COLS}
     FROM news_posts ${whereSql}
     ORDER BY criado_em DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function findPostById(id) {
  const [[row]] = await pool.query(
    `SELECT ${POST_COLS} FROM news_posts WHERE id = ? LIMIT 1`,
    [id]
  );
  return row ?? null;
}

async function insertPost(title, slug, excerpt, content, cover_image_url, category, tags, status, published_at, author_admin_id) {
  const [result] = await pool.query(
    `INSERT INTO news_posts
       (title, slug, excerpt, content, cover_image_url, category, tags, status, published_at, author_admin_id, views)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [title, slug, excerpt, content, cover_image_url, category, tags, status, published_at, author_admin_id]
  );
  return result.insertId;
}

async function updatePost(id, sets, params) {
  const [result] = await pool.query(
    `UPDATE news_posts SET ${sets.join(", ")} WHERE id = ?`,
    [...params, id]
  );
  return result.affectedRows || 0;
}

async function deletePost(id) {
  const [result] = await pool.query("DELETE FROM news_posts WHERE id = ?", [id]);
  return result.affectedRows || 0;
}

async function incrementPostViews(slug) {
  await pool.query(
    "UPDATE news_posts SET views = COALESCE(views, 0) + 1 WHERE slug = ? LIMIT 1",
    [slug]
  );
}

module.exports = {
  slugExists,
  slugExistsExcept,
  countPosts,
  listPosts,
  findPostById,
  insertPost,
  updatePost,
  deletePost,
  incrementPostViews,
};
