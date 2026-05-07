"use strict";

const dronesRepo = require("../../repositories/dronesRepository");
const mediaService = require("../../services/mediaService");
const { clampInt, sanitizeText } = require("./helpers");

/**
 * Sanitiza payload textual do case. Retorna objeto pronto para o
 * repository — campos null quando vazios. Campos de imagem NÃO entram
 * aqui (são tratados separadamente pelo controller via mediaService).
 */
function sanitizeBaseFields(p = {}) {
  return {
    title: sanitizeText(p.title, 160),
    farm_name: sanitizeText(p.farm_name, 160),
    producer_name: sanitizeText(p.producer_name, 120),
    city: sanitizeText(p.city, 80),
    uf: (sanitizeText(p.uf, 2) || "").toUpperCase() || null,
    hectares:
      p.hectares == null || p.hectares === ""
        ? null
        : Number.isFinite(Number(p.hectares))
          ? Number(p.hectares)
          : null,
    model_key:
      (sanitizeText(p.model_key, 20) || "").toLowerCase() || null,
    summary: sanitizeText(p.summary, 500),
    // Testimonial é texto longo — sanitizeText padrão tem limite curto;
    // mantém limite gerenciado no schema Zod (5000 chars).
    testimonial:
      p.testimonial == null
        ? null
        : String(p.testimonial).trim() || null,
  };
}

async function listCasesPublic({ model_key } = {}) {
  const rows = await dronesRepo.listCases({
    activeOnly: true,
    model_key: model_key ? String(model_key).toLowerCase() : null,
  });
  // Resposta pública não expõe permission_to_use/sort_order/is_active.
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    farm_name: r.farm_name,
    producer_name: r.producer_name,
    city: r.city,
    uf: r.uf,
    hectares: r.hectares == null ? null : Number(r.hectares),
    model_key: r.model_key,
    summary: r.summary,
    testimonial: r.testimonial,
    cover_image_url: r.cover_image_url,
    before_image_url: r.before_image_url,
    after_image_url: r.after_image_url,
  }));
}

async function listCasesAdmin({ model_key } = {}) {
  return dronesRepo.listCases({
    activeOnly: false,
    model_key: model_key ? String(model_key).toLowerCase() : null,
  });
}

async function getCaseById(id) {
  const caseId = clampInt(id, null, 1, 999999999);
  if (!caseId) return null;
  return dronesRepo.findCaseById(caseId);
}

async function createCase(payload = {}) {
  const base = sanitizeBaseFields(payload);
  if (!base.title || !base.farm_name) {
    const err = new Error("title e farm_name são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sort_order = clampInt(payload.sort_order, 0, 0, 999999);
  const is_active = payload.is_active == null ? 1 : Number(payload.is_active) ? 1 : 0;
  const permission_to_use = Number(payload.permission_to_use) ? 1 : 0;

  return dronesRepo.insertCase({
    ...base,
    cover_image_url: sanitizeText(payload.cover_image_url, 255),
    before_image_url: sanitizeText(payload.before_image_url, 255),
    after_image_url: sanitizeText(payload.after_image_url, 255),
    permission_to_use,
    sort_order,
    is_active,
  });
}

async function updateCase(id, payload = {}) {
  const caseId = clampInt(id, null, 1, 999999999);
  if (!caseId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  // Campos de texto e numéricos
  const textMap = [
    ["title", 160],
    ["farm_name", 160],
    ["producer_name", 120],
    ["city", 80],
    ["uf", 2],
    ["model_key", 20],
    ["summary", 500],
    ["cover_image_url", 255],
    ["before_image_url", 255],
    ["after_image_url", 255],
  ];
  for (const [k, maxLen] of textMap) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      let v = sanitizeText(payload[k], maxLen);
      if (k === "uf" && v) v = v.toUpperCase();
      if (k === "model_key" && v) v = v.toLowerCase();
      sets.push(`${k}=?`);
      params.push(v);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "testimonial")) {
    const t =
      payload.testimonial == null
        ? null
        : String(payload.testimonial).trim() || null;
    sets.push("testimonial=?");
    params.push(t);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "hectares")) {
    const h =
      payload.hectares == null || payload.hectares === ""
        ? null
        : Number.isFinite(Number(payload.hectares))
          ? Number(payload.hectares)
          : null;
    sets.push("hectares=?");
    params.push(h);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "permission_to_use")) {
    sets.push("permission_to_use=?");
    params.push(Number(payload.permission_to_use) ? 1 : 0);
  }

  return dronesRepo.updateCase(caseId, sets, params);
}

async function deleteCase(id) {
  const caseId = clampInt(id, null, 1, 999999999);
  if (!caseId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // Pega imagens existentes para limpeza
  const row = await dronesRepo.findCaseById(caseId);
  const affected = await dronesRepo.deleteCase(caseId);

  // Limpeza best-effort dos arquivos. Falhas não impedem o delete.
  if (row && affected) {
    const targets = [
      row.cover_image_url,
      row.before_image_url,
      row.after_image_url,
    ].filter(Boolean);
    if (targets.length) {
      try {
        await mediaService.removeMedia(targets);
      } catch (err) {
        console.warn("[drones/cases] cleanup warning:", err?.message || err);
      }
    }
  }

  return affected;
}

module.exports = {
  listCasesPublic,
  listCasesAdmin,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
};
