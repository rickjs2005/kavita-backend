"use strict";
// services/media/adapters/storageUtils.js
// Utilitários puros compartilhados entre disk, S3 e GCS adapters.

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR || "uploads";
const PUBLIC_PREFIX = process.env.MEDIA_PUBLIC_PREFIX || "/uploads";
const MEDIA_PUBLIC_BASE_URL = process.env.MEDIA_PUBLIC_BASE_URL || "";

const ensureDirSync = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const generateId = () => {
  try { return randomUUID(); } catch { return Math.random().toString(36).slice(2); }
};

const sanitizeSegment = (segment = "") =>
  String(segment).replace(/\\+/g, "/").replace(/^\/+|\/+$/g, "");

const buildFilename = (original = "", prefix = "") => {
  const ext = path.extname(original) || "";
  const safePrefix = prefix ? `${sanitizeSegment(prefix)}-` : "";
  return `${safePrefix}${Date.now()}-${generateId()}${ext}`.replace(/\s+/g, "");
};

const normalizeTargets = (targets = []) => {
  const items = Array.isArray(targets) ? targets : [targets];
  return items
    .filter(Boolean)
    .map((item) => (typeof item === "string" ? { path: item } : item))
    .filter((item) => item && item.path);
};

const normalizePublicPrefix = () =>
  PUBLIC_PREFIX.endsWith("/") ? PUBLIC_PREFIX.slice(0, -1) : PUBLIC_PREFIX;

const stripConfiguredBaseUrl = (value = "") => {
  if (!MEDIA_PUBLIC_BASE_URL) return value;
  return value.replace(MEDIA_PUBLIC_BASE_URL, "");
};

module.exports = {
  UPLOAD_DIR, PUBLIC_PREFIX, MEDIA_PUBLIC_BASE_URL,
  ensureDirSync, generateId, sanitizeSegment, buildFilename,
  normalizeTargets, normalizePublicPrefix, stripConfiguredBaseUrl,
};
