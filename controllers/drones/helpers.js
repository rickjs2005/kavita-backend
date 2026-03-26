"use strict";

const fs = require("fs");
const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO = new Set(["video/mp4"]);

const DEFAULT_DRONE_MODELS = [
  { key: "t25p", label: "DJI Agras T25P" },
  { key: "t70p", label: "DJI Agras T70P" },
  { key: "t100", label: "DJI Agras T100" },
];

function safeUnlink(file) {
  try {
    if (file?.path) fs.unlinkSync(file.path);
  } catch { }
}

function classify(file) {
  const mime = String(file?.mimetype || "");
  if (ALLOWED_IMAGE.has(mime)) return { media_type: "IMAGE", max: MAX_IMAGE_BYTES };
  if (ALLOWED_VIDEO.has(mime)) return { media_type: "VIDEO", max: MAX_VIDEO_BYTES };
  return null;
}

function parseJsonField(v) {
  if (!v) return null;
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

function extractItems(result) {
  return Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
}

function normalizeBool(v, defaultValue = true) {
  if (v === undefined || v === null || v === "") return defaultValue;
  return String(v) !== "0" && String(v).toLowerCase() !== "false";
}

function parseModelKey(modelKey) {
  const key = String(modelKey || "").trim().toLowerCase();

  if (!key) {
    throw new AppError("Modelo inválido", ERROR_CODES.VALIDATION_ERROR, 400, {
      field: "modelKey",
      reason: "empty",
    });
  }

  if (!/^[a-z0-9_]{2,20}$/.test(key)) {
    throw new AppError("Modelo inválido", ERROR_CODES.VALIDATION_ERROR, 400, {
      field: "modelKey",
      reason: "format",
      example: "t25p",
    });
  }

  return key;
}

async function ensureModelExists(modelKey) {
  const existing = await dronesService.getDroneModelByKey(modelKey);
  if (!existing) {
    throw new AppError("Modelo não encontrado.", ERROR_CODES.NOT_FOUND, 404, { modelKey });
  }
  return existing;
}

function sendError(res, err) {
  const status = err?.status || err?.statusCode || 500;
  const code = err?.code || "SERVER_ERROR";
  const message = err?.message || "Erro inesperado.";
  const details = err?.details ?? null;

  return res.status(status).json({
    status,
    code,
    message,
    ...(details ? { details } : {}),
  });
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_IMAGE,
  ALLOWED_VIDEO,
  DEFAULT_DRONE_MODELS,
  safeUnlink,
  classify,
  parseJsonField,
  extractItems,
  normalizeBool,
  parseModelKey,
  ensureModelExists,
  sendError,
};
