// services/marketQuotesService.js
//
// Orquestrador das cotações de mercado (Fase 10.4).
//
// Responsabilidades:
//   - Rodar todos os adapters ativos em paralelo (CEPEA, ICE)
//   - Persistir o resultado em `market_quotes` (upsert por chave)
//   - Expor `getCurrent()` que lê do DB (nunca da fonte externa)
//   - Marcar snapshot como "stale" se quoted_at > 48h (dia não útil
//     ou falha da fonte) — frontend decide se esconde ou mostra
//     com badge "última cotação disponível"
//
// Convenção de source/symbol (chave natural de market_quotes):
//   cepea_esalq / arabica_bica_corrida_esalq   → R$/saca 60kg
//   ice_us      / KC.F                         → US cents/lb
"use strict";

const logger = require("../lib/logger");

const marketQuotesRepo = require("../repositories/marketQuotesRepository");
const cotacoesCafeService = require("./cotacoesCafeService");
const iceAdapter = require("./cotacoes/iceAdapter");

const STALE_AFTER_HOURS = 48;

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

/**
 * Roda o adapter CEPEA (hoje: noticiasAgricolas scraping). Usa o
 * service existente que já tem cache in-memory + timeout + fallback.
 */
async function _collectCepea() {
  try {
    const spot = await cotacoesCafeService.getArabicaSpot();
    if (!spot || typeof spot.price_cents !== "number") return null;
    return {
      source: "cepea_esalq",
      symbol: "arabica_bica_corrida_esalq",
      price_brl_cents: spot.price_cents,
      variation_pct: spot.variation_pct,
      quoted_at: spot.as_of
        ? new Date(`${spot.as_of}T00:00:00Z`).toISOString().slice(0, 19).replace("T", " ")
        : new Date().toISOString().slice(0, 19).replace("T", " "),
      source_url: spot.source_url ?? null,
      meta: {
        provider_chain: spot.source, // qual adapter baixou
        unit: "BRL/saca-60kg",
      },
    };
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "market_quotes.cepea.collect_failed",
    );
    return null;
  }
}

/**
 * Roda o adapter ICE.
 */
async function _collectIce() {
  if (!iceAdapter.isConfigured()) return null;
  try {
    const res = await iceAdapter.fetchLatest();
    if (!res) return null;
    return {
      source: res.source,
      symbol: res.symbol,
      price_usd_cents: res.price_usd_cents,
      variation_pct: res.variation_pct,
      quoted_at: res.quoted_at
        ? new Date(res.quoted_at).toISOString().slice(0, 19).replace("T", " ")
        : new Date().toISOString().slice(0, 19).replace("T", " "),
      source_url: res.source_url ?? null,
      meta: res.meta ?? null,
    };
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "market_quotes.ice.collect_failed",
    );
    return null;
  }
}

/**
 * Roda todos os adapters em paralelo e persiste quem respondeu.
 * Chamado pelo cron; também pode ser disparado manualmente via
 * scripts/dev/fetch-market-quotes.js.
 *
 * Retorna resumo { collected: [...sources], failed: [...sources] }
 * para o cron logar.
 */
async function syncAll() {
  const results = await Promise.allSettled([
    _collectCepea(),
    _collectIce(),
  ]);

  const collected = [];
  const failed = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) {
      failed.push(r.reason?.message ?? "null_result");
      continue;
    }
    try {
      await marketQuotesRepo.upsert(r.value);
      collected.push(`${r.value.source}/${r.value.symbol}`);
    } catch (err) {
      logger.error(
        { err: err?.message ?? String(err), source: r.value.source },
        "market_quotes.upsert_failed",
      );
      failed.push(r.value.source);
    }
  }

  logger.info({ collected, failed }, "market_quotes.sync_done");
  return { collected, failed };
}

// ---------------------------------------------------------------------------
// Leitura (endpoint público e frontend)
// ---------------------------------------------------------------------------

/**
 * Transforma linha do DB em payload de frontend, marcando stale
 * quando quoted_at > 48h.
 */
function _project(row) {
  if (!row) return null;
  const quotedAt = row.quoted_at ? new Date(row.quoted_at) : null;
  const ageMs = quotedAt ? Date.now() - quotedAt.getTime() : Infinity;
  const isStale = ageMs > STALE_AFTER_HOURS * 3600 * 1000;

  return {
    source: row.source,
    symbol: row.symbol,
    price_brl_cents: row.price_brl_cents,
    price_usd_cents: row.price_usd_cents,
    variation_pct: row.variation_pct != null ? Number(row.variation_pct) : null,
    quoted_at: row.quoted_at,
    fetched_at: row.fetched_at,
    source_url: row.source_url,
    is_stale: isStale,
  };
}

/**
 * Retorna o snapshot atual de cada indicador conhecido. Mesmo que
 * o cron falhe hoje, a última leitura válida persistida é
 * devolvida — `is_stale` sinaliza se o dado está desatualizado.
 *
 * Shape:
 *   { cepea_arabica: {...} | null, ice_coffee_c: {...} | null }
 */
async function getCurrent() {
  const rows = await marketQuotesRepo.findAll();
  const byKey = Object.fromEntries(
    rows.map((r) => [`${r.source}/${r.symbol}`, _project(r)]),
  );
  return {
    cepea_arabica: byKey["cepea_esalq/arabica_bica_corrida_esalq"] ?? null,
    ice_coffee_c: byKey["ice_us/KC.F"] ?? null,
  };
}

module.exports = {
  syncAll,
  getCurrent,
  STALE_AFTER_HOURS,
  // exposto pra teste
  _internals: { _project, _collectCepea, _collectIce },
};
