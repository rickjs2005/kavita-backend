/**
 * test/unit/services/expiredCleanupService.unit.test.js
 *
 * D2+D3+D1 — cron de limpeza de promoções, hero slides e cupons expirados.
 * Cobre que:
 *   - faz UPDATE em product_promotions, hero_slides e cupons
 *   - retorna a contagem real de linhas afetadas por canal
 *   - falha em uma query NÃO afeta as outras (try/catch isolado)
 *   - retorna zeros quando não há nada vencido
 *   - cupons sem expiracao (NULL) NUNCA são tocados
 *   - apenas linhas com flag de ativo são afetadas
 */

describe("services/expiredCleanupService.runOnce", () => {
  const poolPath = require.resolve("../../../config/pool");

  let pool;
  let svc;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
    }));

    pool = require(poolPath);
    svc = require("../../../services/expiredCleanupService");
  });

  test("desativa promoções, slides e cupons expirados, retorna contagens", async () => {
    pool.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("product_promotions")) {
        return [{ affectedRows: 4 }, undefined];
      }
      if (s.includes("hero_slides")) {
        return [{ affectedRows: 2 }, undefined];
      }
      if (s.includes("cupons")) {
        return [{ affectedRows: 7 }, undefined];
      }
      return [{ affectedRows: 0 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r).toEqual({ promotions: 4, slides: 2, coupons: 7 });
  });

  test("retorna 0/0/0 quando nada vencido", async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }, undefined]);
    const r = await svc.runOnce();
    expect(r).toEqual({ promotions: 0, slides: 0, coupons: 0 });
  });

  test("falha em promotions não impede slides nem coupons", async () => {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("product_promotions")) {
        throw new Error("DB down");
      }
      if (String(sql).includes("hero_slides")) {
        return [{ affectedRows: 3 }, undefined];
      }
      if (String(sql).includes("cupons")) {
        return [{ affectedRows: 9 }, undefined];
      }
      return [{ affectedRows: 0 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r.promotions).toBe(0);
    expect(r.slides).toBe(3);
    expect(r.coupons).toBe(9);
  });

  test("falha em slides não impede promotions nem coupons", async () => {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("hero_slides")) {
        throw new Error("DB down");
      }
      if (String(sql).includes("product_promotions")) {
        return [{ affectedRows: 5 }, undefined];
      }
      if (String(sql).includes("cupons")) {
        return [{ affectedRows: 11 }, undefined];
      }
      return [{ affectedRows: 0 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r.promotions).toBe(5);
    expect(r.slides).toBe(0);
    expect(r.coupons).toBe(11);
  });

  test("falha em coupons não impede promotions nem slides", async () => {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("cupons")) {
        throw new Error("DB down");
      }
      if (String(sql).includes("product_promotions")) {
        return [{ affectedRows: 8 }, undefined];
      }
      if (String(sql).includes("hero_slides")) {
        return [{ affectedRows: 6 }, undefined];
      }
      return [{ affectedRows: 0 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r.promotions).toBe(8);
    expect(r.slides).toBe(6);
    expect(r.coupons).toBe(0);
  });

  test("nunca lança erro mesmo se todos falharem", async () => {
    pool.query.mockRejectedValue(new Error("DB down"));
    await expect(svc.runOnce()).resolves.toEqual({
      promotions: 0,
      slides: 0,
      coupons: 0,
    });
  });

  test("queries usam o campo correto em cada tabela e filtram NOT NULL", async () => {
    const queriesSeen = [];
    pool.query.mockImplementation(async (sql) => {
      queriesSeen.push(String(sql));
      return [{ affectedRows: 0 }, undefined];
    });

    await svc.runOnce();

    expect(queriesSeen).toHaveLength(3);

    // promoções: end_at (sem 's')
    const promoSql = queriesSeen.find((q) => q.includes("product_promotions"));
    expect(promoSql).toMatch(/end_at\s+IS NOT NULL[\s\S]+end_at\s*<\s*NOW\(\)/i);
    expect(promoSql).toMatch(/is_active\s*=\s*1/);
    expect(promoSql).toMatch(/SET\s+is_active\s*=\s*0/);

    // slides: ends_at (com 's')
    const slidesSql = queriesSeen.find((q) => q.includes("hero_slides"));
    expect(slidesSql).toMatch(/ends_at\s+IS NOT NULL[\s\S]+ends_at\s*<\s*NOW\(\)/i);
    expect(slidesSql).toMatch(/is_active\s*=\s*1/);
    expect(slidesSql).toMatch(/SET\s+is_active\s*=\s*0/);

    // cupons: usa expiracao (não end_at) e ativo (não is_active)
    const couponsSql = queriesSeen.find((q) => q.includes("cupons"));
    expect(couponsSql).toMatch(/expiracao\s+IS NOT NULL[\s\S]+expiracao\s*<\s*NOW\(\)/i);
    expect(couponsSql).toMatch(/ativo\s*=\s*1/);
    expect(couponsSql).toMatch(/SET\s+ativo\s*=\s*0/);
  });

  test("D1 — cupons sem expiracao (NULL) nunca são tocados pela query", async () => {
    // Validação semântica do SQL: a cláusula `expiracao IS NOT NULL`
    // garante que campanha perpétua (expiracao=NULL) não é desativada.
    let couponsSql = "";
    pool.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("cupons")) couponsSql = s;
      return [{ affectedRows: 0 }, undefined];
    });

    await svc.runOnce();

    // O SQL precisa ter o guard explícito de NOT NULL — não confiar
    // só no comportamento "expiracao < NOW()" pois NULL < NOW() é NULL,
    // que SQL trata como falso, mas o NOT NULL deixa a intenção clara
    // e protege contra mudança futura no operador.
    expect(couponsSql).toContain("expiracao IS NOT NULL");
  });
});
