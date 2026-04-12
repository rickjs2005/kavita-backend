"use strict";
// repositories/promocoesRepository.js
//
// Acesso a dados para o módulo público de promoções de produtos.
// Tabelas: product_promotions, products, product_images.
//
// Contrato de dados:
//   - Retorna somente promoções ativas (is_active=1) dentro da janela de tempo.
//   - final_price calculado no banco (promo_price tem prioridade sobre discount_percent).
//   - image = primeira imagem do produto (GROUP_CONCAT + SUBSTRING_INDEX).

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Query base
// ---------------------------------------------------------------------------

// SELECT base compartilhado pelos dois endpoints.
// O filtro de produto e o LIMIT são adicionados dinamicamente.
const BASE_SQL = `
  SELECT
    p.id,
    p.name,
    p.description,
    CAST(p.price AS DECIMAL(10,2)) AS original_price,
    COALESCE(p.quantity, 0) AS quantity,
    d.title,
    d.type,
    d.discount_percent,
    d.promo_price,
    d.end_at AS ends_at,
    COALESCE(
      SUBSTRING_INDEX(
        GROUP_CONCAT(pi.path ORDER BY pi.id ASC SEPARATOR ','), ',', 1
      ),
      ''
    ) AS image,
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
  JOIN products p             ON p.id = d.product_id
  LEFT JOIN product_images pi ON pi.product_id = p.id
  WHERE
    d.is_active = 1
    AND p.is_active = 1
    AND p.quantity > 0
    AND (d.start_at IS NULL OR d.start_at <= NOW())
    AND (d.end_at   IS NULL OR d.end_at   >= NOW())
`;

const GROUP_ORDER = `
  GROUP BY
    p.id, p.name, p.description, p.price, p.quantity,
    d.title, d.type, d.discount_percent, d.promo_price, d.end_at
  ORDER BY d.created_at DESC, d.id DESC
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Retorna todas as promoções ativas no momento.
 */
async function findActivePromocoes() {
  const [rows] = await pool.query(`${BASE_SQL}${GROUP_ORDER}`);
  return rows;
}

/**
 * Retorna a promoção ativa de um produto específico, ou null se não houver.
 *
 * @param {number} productId
 */
async function findActivePromocaoByProductId(productId) {
  const [rows] = await pool.query(
    `${BASE_SQL} AND p.id = ? ${GROUP_ORDER} LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findActivePromocoes,
  findActivePromocaoByProductId,
};
