// services/cotacoes/iceAdapter.js
//
// Adapter do futuro do café arábica na ICE US (contrato "C", KC).
// Fonte: Yahoo Finance Chart API v8 (JSON público, rate-limited mas
// grátis e estável).
//
//   https://query1.finance.yahoo.com/v8/finance/chart/KC=F?interval=1d&range=5d
//
// Retorna regularMarketPrice em US cents/lb (currency: "USX"). Ex.:
// 287.85 = 287.85 cents/lb = US$ 2.8785/lb.
//
// Nota histórica: a Yahoo CSV API (/v7/finance/download) foi
// descontinuada em 2023 — exige login. A Chart v8 é pública.
// Stooq, que antes servia CSV livre, hoje exige apikey.
"use strict";

const logger = require("../../lib/logger");

const PROVIDER = "ice_us";
const SYMBOL = "KC.F";
const API_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/KC=F?interval=1d&range=5d";
const PUBLIC_URL = "https://finance.yahoo.com/quote/KC%3DF";

function isConfigured() {
  return (
    (process.env.ICE_COFFEE_PROVIDER_DISABLED || "").toLowerCase() !== "true"
  );
}

/**
 * Chama Yahoo Chart API v8 e extrai a cotação spot + variação D-1.
 * Retorna null em qualquer falha (timeout, 401, payload inesperado).
 */
async function fetchLatest() {
  let res;
  try {
    res = await fetch(API_URL, {
      headers: {
        // Header HTTP é ByteString — ASCII puro.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) Kavita/1.0 cotacao-cache",
        Accept: "application/json",
      },
    });
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "cotacoes.ice.fetch_network_error",
    );
    return null;
  }
  if (!res.ok) {
    logger.warn({ status: res.status }, "cotacoes.ice.fetch_http_error");
    return null;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const meta = body?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose);
  if (!Number.isFinite(price) || price <= 0) return null;

  // Yahoo devolve regularMarketPrice já em US cents/lb (currency USX).
  // Salvamos como INTEGER em cents/lb (drop fracional — precisão
  // comercial é 0,05 cent na ICE, então perder a parte não altera
  // decisão de preço).
  const priceStoredCents = Math.round(price);

  let variationPct = null;
  if (Number.isFinite(prevClose) && prevClose > 0) {
    variationPct = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
  }

  const quotedAtMs = Number(meta.regularMarketTime) * 1000;
  const quotedAt = Number.isFinite(quotedAtMs)
    ? new Date(quotedAtMs).toISOString()
    : new Date().toISOString();

  return {
    source: PROVIDER,
    symbol: SYMBOL,
    price_usd_cents: priceStoredCents,
    variation_pct: variationPct,
    quoted_at: quotedAt,
    source_url: PUBLIC_URL,
    meta: {
      contract: meta.shortName ?? "KC front",
      exchange: meta.exchangeName ?? "ICE",
      unit: "US cents/lb",
      raw_price: price,
    },
  };
}

module.exports = {
  PROVIDER,
  SYMBOL,
  API_URL,
  isConfigured,
  fetchLatest,
};
