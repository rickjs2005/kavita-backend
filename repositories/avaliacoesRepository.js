"use strict";
// repositories/avaliacoesRepository.js
// SQL queries for product reviews (avaliações).

const pool = require("../config/pool");

const PUBLIC_PRODUCT_FIELDS = `
  id,
  name,
  CAST(price AS DECIMAL(10,2)) AS price,
  image,
  rating_avg,
  rating_count,
  shipping_free,
  shipping_free_from_qty
`;

async function quickSearch(busca, limit) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_PRODUCT_FIELDS}
     FROM products
     WHERE name LIKE ?
     ORDER BY rating_avg DESC, rating_count DESC, name ASC
     LIMIT ?`,
    [`%${busca}%`, limit]
  );
  return rows;
}

async function createReview(conn, produtoId, usuarioId, nota, comentario) {
  await conn.query(
    `INSERT INTO produto_avaliacoes (produto_id, usuario_id, nota, comentario)
     VALUES (?, ?, ?, ?)`,
    [produtoId, usuarioId, nota, comentario]
  );
}

async function recalcRating(conn, produtoId) {
  const [[stats]] = await conn.query(
    `SELECT AVG(nota) AS media, COUNT(*) AS total
     FROM produto_avaliacoes
     WHERE produto_id = ?`,
    [produtoId]
  );

  const media = stats?.media ? Number(stats.media) : 0;
  const total = stats?.total ? Number(stats.total) : 0;

  await conn.query(
    "UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?",
    [media, total, produtoId]
  );

  return { media, total };
}

async function findByProductId(produtoId) {
  const [rows] = await pool.query(
    `SELECT
       pa.nota,
       pa.comentario,
       pa.created_at,
       u.nome AS usuario_nome
     FROM produto_avaliacoes pa
     LEFT JOIN usuarios u ON u.id = pa.usuario_id
     WHERE pa.produto_id = ?
     ORDER BY pa.created_at DESC
     LIMIT 50`,
    [produtoId]
  );
  return rows;
}

module.exports = {
  quickSearch,
  createReview,
  recalcRating,
  findByProductId,
};
