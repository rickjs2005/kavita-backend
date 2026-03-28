/**
 * test/unit/repositories/promoSql.unit.test.js
 *
 * Testa repositories/shared/promoSql.js — funções puras, sem banco.
 *
 * Objetivos:
 *   1. Verificar que calcFinalPrice e calcDiscountPercent usam o alias correto
 *   2. Verificar que activePromoWhere funciona com e sem alias
 *   3. Verificar que promoJoin inclui a estrutura esperada
 *   4. GUARD de divergência: mesma lógica, aliases diferentes — substituição exata
 */

"use strict";

const promoSql = require("../../../repositories/shared/promoSql");

// ---------------------------------------------------------------------------
// calcFinalPrice
// ---------------------------------------------------------------------------

describe("promoSql.calcFinalPrice", () => {
  test("usa o alias de promoção fornecido", () => {
    const sql = promoSql.calcFinalPrice("promo");
    expect(sql).toContain("promo.promo_price");
    expect(sql).toContain("promo.discount_percent");
  });

  test("usa alias alternativo (pp) corretamente", () => {
    const sql = promoSql.calcFinalPrice("pp");
    expect(sql).toContain("pp.promo_price");
    expect(sql).toContain("pp.discount_percent");
    expect(sql).not.toContain("promo.promo_price");
  });

  test("usa o alias de produto fornecido", () => {
    const sql = promoSql.calcFinalPrice("promo", "prod");
    expect(sql).toContain("prod.price");
    expect(sql).not.toContain("p.price");
  });

  test("produz CAST AS DECIMAL(10,2)", () => {
    const sql = promoSql.calcFinalPrice("promo");
    expect(sql).toMatch(/CAST\s*\(/i);
    expect(sql).toContain("DECIMAL(10,2)");
  });

  // Guard: a diferença entre os dois usos é APENAS o alias — lógica idêntica
  test("[divergence guard] calcFinalPrice('promo') e calcFinalPrice('pp') diferem só pelo alias", () => {
    const forPromo = promoSql.calcFinalPrice("promo");
    const forPp    = promoSql.calcFinalPrice("pp");
    expect(forPromo.replaceAll("promo.", "pp.")).toBe(forPp);
  });
});

// ---------------------------------------------------------------------------
// calcDiscountPercent
// ---------------------------------------------------------------------------

describe("promoSql.calcDiscountPercent", () => {
  test("usa o alias de promoção fornecido", () => {
    const sql = promoSql.calcDiscountPercent("promo");
    expect(sql).toContain("promo.discount_percent");
    expect(sql).toContain("promo.promo_price");
  });

  test("produz CAST AS DECIMAL(10,2)", () => {
    const sql = promoSql.calcDiscountPercent("promo");
    expect(sql).toContain("DECIMAL(10,2)");
  });

  test("[divergence guard] calcDiscountPercent('promo') e ('pp') diferem só pelo alias", () => {
    const forPromo = promoSql.calcDiscountPercent("promo");
    const forPp    = promoSql.calcDiscountPercent("pp");
    expect(forPromo.replaceAll("promo.", "pp.")).toBe(forPp);
  });
});

// ---------------------------------------------------------------------------
// activePromoWhere
// ---------------------------------------------------------------------------

describe("promoSql.activePromoWhere", () => {
  test("sem alias — sem prefixo nas colunas", () => {
    const sql = promoSql.activePromoWhere();
    expect(sql).toContain("is_active = 1");
    expect(sql).toContain("start_at IS NULL");
    expect(sql).toContain("end_at   IS NULL");
    expect(sql).not.toMatch(/\w+\.is_active/);
  });

  test("com alias — colunas prefixadas corretamente", () => {
    const sql = promoSql.activePromoWhere("pp");
    expect(sql).toContain("pp.is_active = 1");
    expect(sql).toContain("pp.start_at");
    expect(sql).toContain("pp.end_at");
  });

  test("[divergence guard] activePromoWhere(null) e activePromoWhere('pp') diferem só pelo prefixo", () => {
    const bare  = promoSql.activePromoWhere(null);
    const withAlias = promoSql.activePromoWhere("pp");
    expect(withAlias.replaceAll("pp.", "")).toBe(bare);
  });
});

// ---------------------------------------------------------------------------
// promoJoin
// ---------------------------------------------------------------------------

describe("promoSql.promoJoin", () => {
  test("contém LEFT JOIN e alias 'promo'", () => {
    const sql = promoSql.promoJoin();
    expect(sql).toContain("LEFT JOIN");
    expect(sql).toContain("promo ON promo.product_id");
  });

  test("contém MAX(id) para desempate", () => {
    const sql = promoSql.promoJoin();
    expect(sql).toContain("MAX(id) AS max_id");
  });

  test("inclui o filtro de promoção ativa (sem alias)", () => {
    const sql = promoSql.promoJoin();
    expect(sql).toContain("is_active = 1");
    expect(sql).toContain("start_at IS NULL");
    expect(sql).toContain("end_at   IS NULL");
  });

  test("usa o alias de produto fornecido", () => {
    const sql = promoSql.promoJoin("prod");
    expect(sql).toContain("promo.product_id = prod.id");
  });
});
