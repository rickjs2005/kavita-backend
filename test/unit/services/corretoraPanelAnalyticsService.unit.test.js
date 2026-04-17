/**
 * test/unit/services/corretoraPanelAnalyticsService.unit.test.js
 *
 * Cobre a orquestração do dashboard do painel: delta vs período
 * anterior, cálculo de taxas, tolerância a zero.
 *
 * Mock do repository — queries reais ficam para integração.
 */

describe("services/corretoraPanelAnalyticsService", () => {
  const repoPath = require.resolve(
    "../../../repositories/corretoraPanelAnalyticsRepository",
  );
  let svc;
  let repo;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    repo = {
      totals: jest.fn(),
      leadsByDay: jest.fn().mockResolvedValue([]),
      slaStats: jest.fn(),
      regionalComparison: jest.fn().mockResolvedValue({
        city: "Manhuaçu",
        region_avg_seconds: null,
        region_sample_size: 0,
      }),
      REGIONAL_MIN_SAMPLE: 5,
    };
    jest.doMock(repoPath, () => repo);
    svc = require("../../../services/corretoraPanelAnalyticsService");
  });

  function baseTotals(overrides = {}) {
    return {
      leads: 0,
      leads_responded: 0,
      leads_under_1h: 0,
      leads_under_24h: 0,
      status_new: 0,
      status_contacted: 0,
      status_closed: 0,
      status_lost: 0,
      ...overrides,
    };
  }
  function baseSla(overrides = {}) {
    return {
      count: 0,
      avg_seconds: null,
      p50_seconds: null,
      p90_seconds: null,
      ...overrides,
    };
  }

  describe("getDashboard — range validation", () => {
    it("normaliza range inválido para 30d", async () => {
      repo.totals.mockResolvedValue(baseTotals());
      repo.slaStats.mockResolvedValue(baseSla());
      const out = await svc.getDashboard(1, "bogus");
      expect(out.range).toBe("30d");
      expect(out.days).toBe(30);
    });

    it("aceita 7d / 30d / 90d explicitamente", async () => {
      repo.totals.mockResolvedValue(baseTotals());
      repo.slaStats.mockResolvedValue(baseSla());

      for (const r of ["7d", "30d", "90d"]) {
        const out = await svc.getDashboard(1, r);
        expect(out.range).toBe(r);
      }
    });
  });

  describe("getDashboard — deltas e taxas", () => {
    it("calcula pct delta positivo quando leads cresceram", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals({ leads: 20, leads_responded: 15 }))
        .mockResolvedValueOnce(baseTotals({ leads: 10, leads_responded: 5 }));
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.totals.delta.leads).toBe(100);
      expect(out.totals.delta.leads_responded).toBe(200);
    });

    it("pct delta retorna null quando período anterior era 0 (n/a)", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals({ leads: 10 }))
        .mockResolvedValueOnce(baseTotals({ leads: 0 }));
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.totals.delta.leads).toBeNull();
    });

    it("pct delta retorna 0 quando ambos períodos são 0", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals())
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.totals.delta.leads).toBe(0);
    });

    it("response_rate calcula porcentagem arredondada", async () => {
      repo.totals
        .mockResolvedValueOnce(
          baseTotals({ leads: 7, leads_responded: 3, leads_under_1h: 1 }),
        )
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.rates.response_rate).toBe(43); // 3/7
      expect(out.rates.under_1h_rate).toBe(14); // 1/7 arredonda
    });

    it("rates retornam null quando leads=0 (evita divisão por zero)", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals())
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.rates.response_rate).toBeNull();
      expect(out.rates.under_1h_rate).toBeNull();
      expect(out.rates.under_24h_rate).toBeNull();
      expect(out.rates.close_rate).toBeNull();
    });

    it("close_rate usa status_closed / total_leads", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals({ leads: 10, status_closed: 4 }))
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.rates.close_rate).toBe(40);
    });
  });

  describe("getDashboard — SLA delta", () => {
    it("delta em segundos positivo = piorou (ficou mais lento)", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals({ leads: 5 }))
        .mockResolvedValueOnce(baseTotals({ leads: 5 }));
      repo.slaStats
        .mockResolvedValueOnce(baseSla({ count: 5, avg_seconds: 3600, p50_seconds: 1800 }))
        .mockResolvedValueOnce(baseSla({ count: 5, avg_seconds: 1800, p50_seconds: 900 }));

      const out = await svc.getDashboard(1, "30d");
      expect(out.sla.delta.avg_seconds).toBe(1800); // +30 min
      expect(out.sla.delta.p50_seconds).toBe(900);
    });

    it("delta null quando período sem SLA (count=0)", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals())
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.sla.delta.avg_seconds).toBeNull();
      expect(out.sla.delta.p50_seconds).toBeNull();
    });
  });

  describe("getDashboard — funnel", () => {
    it("propaga contagens por status", async () => {
      repo.totals
        .mockResolvedValueOnce(
          baseTotals({
            leads: 10,
            status_new: 3,
            status_contacted: 4,
            status_closed: 2,
            status_lost: 1,
          }),
        )
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());

      const out = await svc.getDashboard(1, "30d");
      expect(out.funnel).toEqual({ new: 3, contacted: 4, closed: 2, lost: 1 });
    });
  });

  describe("getDashboard — comparativo regional", () => {
    it("propaga payload do repo (anonimizado)", async () => {
      repo.totals
        .mockResolvedValueOnce(baseTotals())
        .mockResolvedValueOnce(baseTotals());
      repo.slaStats
        .mockResolvedValueOnce(baseSla())
        .mockResolvedValueOnce(baseSla());
      repo.regionalComparison.mockResolvedValue({
        city: "Manhuaçu",
        region_avg_seconds: 7200,
        region_sample_size: 12,
      });

      const out = await svc.getDashboard(1, "30d");
      expect(out.regional).toEqual({
        city: "Manhuaçu",
        region_avg_seconds: 7200,
        region_sample_size: 12,
      });
    });
  });
});
