"use strict";

// repositories/newsSyncConfigRepository.js
// Single-row config for news sync (clima auto-sync settings).

const pool = require("../config/pool");

/**
 * Ensures the singleton row exists. Returns the config object.
 * Safe to call on every read — INSERT IGNORE is a no-op if row exists.
 */
async function getConfig() {
  await pool.query(
    "INSERT IGNORE INTO news_sync_config (id) VALUES (1)"
  );
  const [rows] = await pool.query(
    "SELECT id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms, updated_at FROM news_sync_config WHERE id = 1"
  );
  return rows[0] || null;
}

/**
 * Partial update of sync config. Only updates fields present in `data`.
 *
 * @param {{ clima_sync_enabled?: boolean, clima_sync_cron?: string, clima_sync_delay_ms?: number }} data
 */
async function updateConfig(data) {
  const fields = [];
  const params = [];

  const map = {
    clima_sync_enabled: "clima_sync_enabled",
    clima_sync_cron: "clima_sync_cron",
    clima_sync_delay_ms: "clima_sync_delay_ms",
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
