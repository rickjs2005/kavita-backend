"use strict";

const dronesRepo = require("../../repositories/dronesRepository");

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
// DB schema helpers (delegate to repository)
// =====================

async function hasColumn(table, col) {
  return dronesRepo.columnExists(table, col);
}

async function getTableRowCount(table) {
  return dronesRepo.tableRowCount(table);
}

module.exports = { clampInt, safeParseJson, sanitizeText, hasColumn, getTableRowCount };
