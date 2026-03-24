// utils/newsHelpers.js
// Helpers compartilhados pelos controllers do módulo news (clima, cotações, posts, público).
// Importar aqui em vez de duplicar em cada controller.

/* =========================
 * Respostas padronizadas
 * ========================= */

function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta !== undefined) payload.meta = meta;
  return res.status(200).json(payload);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

function fail(res, status, code, message, details) {
  const payload = { ok: false, code, message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

/* =========================
 * Conversores de tipo
 * ========================= */

function toInt(v, def = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? def : n;
}

function toFloat(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function toBoolTiny(v, def = 1) {
  if (v === null || v === undefined || v === "") return def;
  if (v === true) return 1;
  if (v === false) return 0;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "sim" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "nao" || s === "não" || s === "no") return 0;
  const n = toInt(v, def);
  return n ? 1 : 0;
}

/* =========================
 * Validadores de string
 * ========================= */

function isNonEmptyStr(v, max = 999999) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function isOptionalStr(v, max) {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && v.trim().length <= max;
}

function isValidDateTimeLike(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s);
}

/* =========================
 * Slug
 * ========================= */

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/* =========================
 * Data/hora
 * ========================= */

function nowSql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

/* =========================
 * Paginação
 * ========================= */

function sanitizeLimitOffset(limit, offset, maxLimit = 100) {
  const lim = Math.min(Math.max(toInt(limit, 10), 1), maxLimit);
  const off = Math.max(toInt(offset, 0), 0);
  return { lim, off };
}

module.exports = {
  ok,
  created,
  fail,
  toInt,
  toFloat,
  toBoolTiny,
  isNonEmptyStr,
  isOptionalStr,
  isValidDateTimeLike,
  normalizeSlug,
  isValidSlug,
  nowSql,
  sanitizeLimitOffset,
};
