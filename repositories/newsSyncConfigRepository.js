"use strict";

// repositories/newsSyncConfigRepository.js
// Single-row config for news sync (clima + cotações auto-sync settings).
// Cotações columns are added by migration 2026040600000002 and may not
// exist yet. All reads/writes detect their presence dynamically.

const pool = require("../config/pool");

// ─── Column detection (cached per process) ──────────────────────────────────

let _hasCotacoesCols = null;

async function hasCotacoesCols() {
  if (_hasCotacoesCols !== null) return _hasCotacoesCols;
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_sync_config' AND COLUMN_NAME = 'cotacoes_sync_enabled'"
    );
    _hasCotacoesCols = Array.isArray(cols) && cols.length > 0;
  } catch {
    _hasCotacoesCols = false;
  }
  return _hasCotacoesCols;
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function getConfig() {
  await pool.query("INSERT IGNORE INTO news_sync_config (id) VALUES (1)");

  const withCotacoes = await hasCotacoesCols();

  const select = withCotacoes
    ? "SELECT id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms, cotacoes_sync_enabled, cotacoes_sync_cron, updated_at FROM news_sync_config WHERE id = 1"
    : "SELECT id, clima_sync_enabled, clima_sync_cron, clima_sync_delay_ms, updated_at FROM news_sync_config WHERE id = 1";

  const [rows] = await pool.query(select);
  return rows[0] || null;
}

async function updateConfig(data) {
  const withCotacoes = await hasCotacoesCols();

  const fields = [];
  const params = [];

  // Base columns (always exist)
  const map = {
    clima_sync_enabled: "clima_sync_enabled",
    clima_sync_cron: "clima_sync_cron",
    clima_sync_delay_ms: "clima_sync_delay_ms",
  };

  // Cotações columns (only if migration was applied)
  if (withCotacoes) {
    map.cotacoes_sync_enabled = "cotacoes_sync_enabled";
    map.cotacoes_sync_cron = "cotacoes_sync_cron";
  }

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
