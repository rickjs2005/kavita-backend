"use strict";

// repositories/newsSyncConfigRepository.js
// Single-row config for news sync (clima + cotações auto-sync settings).

const pool = require("../config/pool");

/**
 * Ensures the singleton row exists. Returns the config object.
 * Safe to call on every read — INSERT IGNORE is a no-op if row exists.
 * Dynamically detects which columns exist (cotações columns added by migration).
 */
async function getConfig() {
  await pool.query(
    "INSERT IGNORE INTO news_sync_config (id) VALUES (1)"
  );

  // Check if cotacoes columns exist (migration may not have run yet)
  let hasCotacoesCols = false;
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_sync_config' AND COLUMN_NAME = 'cotacoes_sync_enabled'"
    );
    hasCotacoesCols = Array.isArray(cols) && cols.length > 0;
  } catch { /* ignore */ }

  const select = hasCotacoesCols
    ? "SELECT id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms, cotacoes_sync_enabled, cotacoes_sync_cron, updated_at FROM news_sync_config WHERE id = 1"
    : "SELECT id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms, updated_at FROM news_sync_config WHERE id = 1";

  const [rows] = await pool.query(select);
  return rows[0] || null;
}

/**
 * Partial update of sync config. Only updates fields present in `data`.
 */
async function updateConfig(data) {
  const fields = [];
  const params = [];

  const map = {
    clima_sync_enabled: "clima_sync_enabled",
    clima_sync_cron: "clima_sync_cron",
    clima_sync_delay_ms: "clima_sync_delay_ms",
    cotacoes_sync_enabled: "cotacoes_sync_enabled",
    cotacoes_sync_cron: "cotacoes_sync_cron",
  };

  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      fields.push(`${col} = ?`);
      params.push(data[key]);
    }
  }

  if (!fields.length) return;

  await pool.query(
    `UPDATE news_sync_config SET ${fields.join(", ")} WHERE id = 1`,
    params
  );
}

module.exports = { getConfig, updateConfig };
