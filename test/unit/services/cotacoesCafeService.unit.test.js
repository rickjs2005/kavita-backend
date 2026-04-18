/**
 * test/unit/services/cotacoesCafeService.unit.test.js
 *
 * ETAPA 3.1 — cotações com cache + fallback silencioso.
 */

describe("services/cotacoesCafeService", () => {
  const originalProvider = process.env.COTACAO_CAFE_PROVIDER;
  const adapterPath = require.resolve(
    "../../../services/cotacoes/noticiasAgricolasAdapter",
  );
  let svc;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.COTACAO_CAFE_PROVIDER = originalProvider;
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  it("retorna null quando nenhum provider está configurado", async () => {
    delete process.env.COTACAO_CAFE_PROVIDER;
    svc = require("../../../services/cotacoesCafeService");
    const r = await svc.getArabicaSpot();
    expect(r).toBeNull();
  });

  it("retorna null quando provider não reconhecido", async () => {
    process.env.COTACAO_CAFE_PROVIDER = "nonexistent";
    svc = require("../../../services/cotacoesCafeService");
    const r = await svc.getArabicaSpot();
    expect(r).toBeNull();
  });

  it("usa adapter quando configurado e retorna shape normalizado", async () => {
    process.env.COTACAO_CAFE_PROVIDER = "noticias_agricolas";
    jest.doMock(adapterPath, () => ({
      PROVIDER: "noticias_agricolas",
      isConfigured: () => true,
      fetchArabicaPrice: async () => ({
        price_cents: 180072,
        variation_pct: -1.2234,
        as_of: "2026-04-18",
        source_url: "https://example.com",
      }),
    }));
    svc = require("../../../services/cotacoesCafeService");
    const r = await svc.getArabicaSpot();
    expect(r).toEqual({
      price_cents: 180072,
      variation_pct: -1.22, // truncado 2 casas
      as_of: "2026-04-18",
      source: "noticias_agricolas",
      source_url: "https://example.com",
    });
  });

  it("cacheia resultado (segunda chamada não bate no adapter)", async () => {
    process.env.COTACAO_CAFE_PROVIDER = "noticias_agricolas";
    const mockFetch = jest.fn().mockResolvedValue({
      price_cents: 180000,
      variation_pct: 0.5,
      as_of: "2026-04-18",
      source_url: null,
    });
    jest.doMock(adapterPath, () => ({
      PROVIDER: "noticias_agricolas",
      isConfigured: () => true,
      fetchArabicaPrice: mockFetch,
    }));
    svc = require("../../../services/cotacoesCafeService");
    await svc.getArabicaSpot();
    await svc.getArabicaSpot();
    await svc.getArabicaSpot();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retorna null silenciosamente quando adapter lança", async () => {
    process.env.COTACAO_CAFE_PROVIDER = "noticias_agricolas";
    jest.doMock(adapterPath, () => ({
      PROVIDER: "noticias_agricolas",
      isConfigured: () => true,
      fetchArabicaPrice: async () => {
        throw new Error("timeout");
      },
    }));
    svc = require("../../../services/cotacoesCafeService");
    const r = await svc.getArabicaSpot();
    expect(r).toBeNull();
  });

  it("retorna null quando adapter devolve shape inválido (sem price_cents)", async () => {
    process.env.COTACAO_CAFE_PROVIDER = "noticias_agricolas";
    jest.doMock(adapterPath, () => ({
      PROVIDER: "noticias_agricolas",
      isConfigured: () => true,
      fetchArabicaPrice: async () => ({ garbage: true }),
    }));
    svc = require("../../../services/cotacoesCafeService");
    const r = await svc.getArabicaSpot();
    expect(r).toBeNull();
  });
});
