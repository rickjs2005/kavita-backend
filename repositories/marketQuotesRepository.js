// repositories/marketQuotesRepository.js
//
// Persistência dos snapshots de cotação. Chave natural é (source, symbol).
// Upsert atômico via INSERT ... ON DUPLICATE KEY UPDATE — cron chama
// em cada fonte; leitura pelo endpoint público é findLatestByKey ou
// findAll (para o ticker que mostra múltiplas cotações lado a lado).
"use strict";

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    meta: parseJsonField(row.meta),
  };
}

async function upsert({
  source,
  symbol,
  price_brl_cents,
  price_usd_cents,
  variation_pct,
  quoted_at,
  source_url,
  meta,
}) {
  await pool.query(
    `INSERT INTO market_quotes
       (source, symbol, price_brl_cents, price_usd_cents,
        variation_pct, quoted_at, fetched_at, source_url, meta)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
     ON DUPLICATE KEY UPDATE
       price_brl_cents = VALUES(price_brl_cents),
       price_usd_cents = VALUES(price_usd_cents),
       variation_pct   = VALUES(variation_pct),
       quoted_at       = VALUES(quoted_at),
       fetched_at      = CURRENT_TIMESTAMP,
       source_url      = VALUES(source_url),
       meta            = VALUES(meta)`,
    [
      source,
      symbol,
      price_brl_cents ?? null,
      price_usd_cents ?? null,
      variation_pct ?? null,
      quoted_at,
      source_url ?? null,
      meta ? JSON.stringify(meta) : null,
    ],
  );
}

async function findByKey(source, symbol) {
  const [rows] = await pool.query(
    "SELECT * FROM market_quotes WHERE source = ? AND symbol = ? LIMIT 1",
    [source, symbol],
  );
  return hydrate(rows[0]);
}

async function findAll() {
  const [rows] = await pool.query(
    "SELECT * FROM market_quotes ORDER BY source, symbol",
  );
  return rows.map(hydrate);
}

module.exports = { upsert, findByKey, findAll };
