"use strict";
// repositories/promocoesAdminRepository.js
//
// SQL queries for admin product promotions CRUD.
// Par: promocoesRepository.js (público, leitura de promoções ativas)
//      promocoesAdminRepository.js (admin, CRUD completo)

const pool = require("../config/pool");

async function findAll() {
  const [rows] = await pool.query(`
    SELECT
      d.id,
      d.product_id,
      p.name,
      COALESCE(
        p.image,
        (
          SELECT pi.\`path\`
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.id ASC
          LIMIT 1
        )
      ) AS image,
      CAST(p.price AS DECIMAL(10,2)) AS original_price,
      d.promo_price,
      d.discount_percent,
      d.title,
      d.type,
      d.start_at,
      d.end_at,
      d.is_active,
      CASE
        WHEN d.is_active = 1
         AND (d.start_at IS NULL OR d.start_at <= NOW())
         AND (d.end_at   IS NULL OR d.end_at   >= NOW())
        THEN 'ATIVA'
        ELSE 'INATIVA'
      END AS status,
      CAST(
        CASE
          WHEN d.promo_price IS NOT NULL
            THEN d.promo_price
          WHEN d.discount_percent IS NOT NULL
            THEN p.price - (p.price * (d.discount_percent / 100))
          ELSE p.price
        END
      AS DECIMAL(10,2)) AS final_price
    FROM product_promotions d
    JOIN products p ON p.id = d.product_id
    ORDER BY d.created_at DESC, d.id DESC
  `);
  return rows;
}

async function productExists(productId) {
  const [rows] = await pool.query(
    "SELECT id FROM products WHERE id = ? LIMIT 1",
    [productId]
  );
  return rows.length > 0;
}

async function promoExistsForProduct(productId) {
  const [rows] = await pool.query(
    "SELECT id FROM product_promotions WHERE product_id = ? LIMIT 1",
    [productId]
  );
  return rows.length > 0;
}

async function findById(id) {
  const [rows] = await pool.query(
    "SELECT id FROM product_promotions WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

async function create(data) {
  const {
    product_id,
    title,
    type,
    discount_percent,
    promo_price,
    start_at,
    end_at,
    is_active,
  } = data;

  await pool.query(
    `INSERT INTO product_promotions
       (product_id, title, type, discount_percent, promo_price, start_at, end_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [product_id, title, type, discount_percent, promo_price, start_at, end_at, is_active]
  );
}

async function update(id, data) {
  const fields = [];
  const values = [];

  const updatable = [
    "title",
    "type",
    "discount_percent",
    "promo_price",
    "start_at",
    "end_at",
    "is_active",
  ];

  for (const key of updatable) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (fields.length === 0) return false;

  values.push(id);
  const [result] = await pool.query(
    `UPDATE product_promotions SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function remove(id) {
  const [result] = await pool.query(
    "DELETE FROM product_promotions WHERE id = ?",
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findAll,
  productExists,
  promoExistsForProduct,
  findById,
  create,
  update,
  remove,
};
