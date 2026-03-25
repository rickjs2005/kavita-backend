"use strict";

const pool = require("../../config/pool");

// =====================
// Pure helpers (no DB)
// =====================

function clampInt(val, def, min, max) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}

function safeParseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (!t) return fallback;
  try {
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

function sanitizeText(v, maxLen) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (maxLen && s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

// =====================
// DB schema helpers
// =====================

async function hasColumn(table, col) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, col]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function getTableRowCount(table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows?.[0]?.total || 0);
}

module.exports = { clampInt, safeParseJson, sanitizeText, hasColumn, getTableRowCount };
