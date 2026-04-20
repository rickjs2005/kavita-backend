// test/unit/services/iceAdapter.unit.test.js
"use strict";

const adapter = require("../../../services/cotacoes/iceAdapter");

describe("iceAdapter.isConfigured", () => {
  const prev = process.env.ICE_COFFEE_PROVIDER_DISABLED;
  afterEach(() => {
    process.env.ICE_COFFEE_PROVIDER_DISABLED = prev;
  });

  it("true quando env está vazia", () => {
    delete process.env.ICE_COFFEE_PROVIDER_DISABLED;
    expect(adapter.isConfigured()).toBe(true);
  });

  it("false quando explicitamente desabilitado", () => {
    process.env.ICE_COFFEE_PROVIDER_DISABLED = "true";
    expect(adapter.isConfigured()).toBe(false);
  });
});

describe("iceAdapter.fetchLatest (mocked fetch)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("retorna cotação + variação quando Yahoo responde OK", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 287.85,
                chartPreviousClose: 304.25,
                regularMarketTime: 1776706195,
                shortName: "Coffee Jul 26",
                exchangeName: "NYB",
              },
            },
          ],
        },
      }),
    });

    const res = await adapter.fetchLatest();
    expect(res).not.toBeNull();
    expect(res.source).toBe("ice_us");
    expect(res.symbol).toBe("KC.F");
    expect(res.price_usd_cents).toBe(288); // arredondado
    // (287.85 - 304.25) / 304.25 * 100 ≈ -5.39
    expect(res.variation_pct).toBeLessThan(-5);
    expect(res.variation_pct).toBeGreaterThan(-5.5);
    expect(res.quoted_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("retorna null quando Yahoo devolve 401", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const res = await adapter.fetchLatest();
    expect(res).toBeNull();
  });

  it("retorna null quando meta não existe no payload", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ chart: { result: [] } }),
    });
    expect(await adapter.fetchLatest()).toBeNull();
  });

  it("retorna null quando preço é inválido", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        chart: {
          result: [{ meta: { regularMarketPrice: 0 } }],
        },
      }),
    });
    expect(await adapter.fetchLatest()).toBeNull();
  });

  it("lida com falha de rede sem lançar", async () => {
    global.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await adapter.fetchLatest()).toBeNull();
  });
});
