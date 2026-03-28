"use strict";

// repositories/shared/promoSql.js
//
// Única fonte de verdade para fragmentos SQL de promoção de produtos.
//
// Regra de negócio codificada aqui:
//   promo_price (valor absoluto) > discount_percent (percentual) > list price
//
// Consumidores: productRepository.js, checkoutRepository.js
// Qualquer novo módulo que precise de preço efetivo de produto deve usar estas funções.

/**
 * SQL CASE expression para o preço efetivo do produto.
 *
 * @param {string} promoAlias   - Alias da tabela/subquery de promoções (ex: "promo", "pp")
 * @param {string} productAlias - Alias da tabela de produtos (padrão: "p")
 * @returns {string}
 */
function calcFinalPrice(promoAlias, productAlias = "p") {
  return `CAST(
    CASE
      WHEN ${promoAlias}.promo_price IS NOT NULL
        THEN ${promoAlias}.promo_price
      WHEN ${promoAlias}.discount_percent IS NOT NULL
        THEN ${productAlias}.price - (${productAlias}.price * (${promoAlias}.discount_percent / 100))
      ELSE ${productAlias}.price
    END
  AS DECIMAL(10,2))`;
}

/**
 * SQL CASE expression para o percentual de desconto efetivo.
 *
 * @param {string} promoAlias
 * @param {string} productAlias
 * @returns {string}
 */
function calcDiscountPercent(promoAlias, productAlias = "p") {
  return `CAST(
    CASE
      WHEN ${promoAlias}.discount_percent IS NOT NULL THEN ${promoAlias}.discount_percent
      WHEN ${promoAlias}.promo_price IS NOT NULL AND ${productAlias}.price > 0
        THEN ((${productAlias}.price - ${promoAlias}.promo_price) / ${productAlias}.price) * 100
      ELSE 0
    END
  AS DECIMAL(10,2))`;
}

/**
 * Condições WHERE que identificam uma promoção ativa (sem a palavra-chave WHERE).
 *
 * @param {string|null} alias - Prefixo de alias (ex: "pp"). null = sem prefixo.
 * @returns {string}
 */
function activePromoWhere(alias = null) {
  const p = alias ? `${alias}.` : "";
  return `${p}is_active = 1
    AND (${p}start_at IS NULL OR ${p}start_at <= NOW())
    AND (${p}end_at   IS NULL OR ${p}end_at   >= NOW())`;
}

/**
 * LEFT JOIN subquery que resolve para a promoção ativa de maior id por produto.
 * Desempate por MAX(id) — mesma semântica original de productRepository.js.
 * O alias do resultado é sempre "promo".
 *
 * @param {string} productAlias - Alias da tabela de produtos (padrão: "p")
 * @returns {string}
 */
function promoJoin(productAlias = "p") {
  return `
  LEFT JOIN (
    SELECT d.*
    FROM product_promotions d
    JOIN (
      SELECT product_id, MAX(id) AS max_id
      FROM product_promotions
      WHERE ${activePromoWhere()}
      GROUP BY product_id
    ) x ON x.product_id = d.product_id AND x.max_id = d.id
  ) promo ON promo.product_id = ${productAlias}.id`;
}

module.exports = { calcFinalPrice, calcDiscountPercent, activePromoWhere, promoJoin };
