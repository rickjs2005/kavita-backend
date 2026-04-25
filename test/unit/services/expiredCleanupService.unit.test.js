/**
 * test/unit/services/expiredCleanupService.unit.test.js
 *
 * D2+D3 — cron de limpeza de promoções e hero slides expirados.
 * Cobre que:
 *   - faz UPDATE em product_promotions e hero_slides
 *   - retorna a contagem real de linhas afetadas
 *   - falha em uma query NÃO afeta a outra
 *   - retorna {0,0} quando não há nada vencido
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

  test("desativa promoções e slides expirados, retorna contagens", async () => {
    pool.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("product_promotions")) {
        return [{ affectedRows: 4 }, undefined];
      }
      if (s.includes("hero_slides")) {
        return [{ affectedRows: 2 }, undefined];
      }
      return [{ affectedRows: 0 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r).toEqual({ promotions: 4, slides: 2 });
  });

  test("retorna 0/0 quando nada vencido", async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }, undefined]);
    const r = await svc.runOnce();
    expect(r).toEqual({ promotions: 0, slides: 0 });
  });

  test("falha em promotions não impede slides", async () => {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("product_promotions")) {
        throw new Error("DB down");
      }
      return [{ affectedRows: 3 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r.promotions).toBe(0);
    expect(r.slides).toBe(3);
  });

  test("falha em slides não impede contagem de promotions", async () => {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("hero_slides")) {
        throw new Error("DB down");
      }
      return [{ affectedRows: 5 }, undefined];
    });

    const r = await svc.runOnce();
    expect(r.promotions).toBe(5);
    expect(r.slides).toBe(0);
  });

  test("nunca lança erro mesmo se ambos falharem", async () => {
    pool.query.mockRejectedValue(new Error("DB down"));
    await expect(svc.runOnce()).resolves.toEqual({
      promotions: 0,
      slides: 0,
    });
  });

  test("filtra apenas linhas com end_at/ends_at < NOW()", async () => {
    const queriesSeen = [];
    pool.query.mockImplementation(async (sql) => {
      queriesSeen.push(String(sql));
      return [{ affectedRows: 0 }, undefined];
    });

    await svc.runOnce();

    expect(queriesSeen).toHaveLength(2);
    // promoções: usa end_at (compatível com schema product_promotions)
    expect(queriesSeen.find((q) => q.includes("product_promotions"))).toMatch(
      /end_at\s+IS NOT NULL[\s\S]+end_at\s*<\s*NOW\(\)/i,
    );
    // slides: usa ends_at (compatível com schema hero_slides)
    expect(queriesSeen.find((q) => q.includes("hero_slides"))).toMatch(
      /ends_at\s+IS NOT NULL[\s\S]+ends_at\s*<\s*NOW\(\)/i,
    );
    // ambas só tocam linhas com is_active = 1
    queriesSeen.forEach((q) => {
      expect(q).toMatch(/is_active\s*=\s*1/);
      expect(q).toMatch(/SET\s+is_active\s*=\s*0/);
    });
  });
});
