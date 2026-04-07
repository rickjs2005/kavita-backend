"use strict";
// controllers/heroSlidesController.js
// Pair: routes/admin/adminHeroSlides.js + routes/public/publicHeroSlides.js

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const repo = require("../repositories/heroSlidesRepository");
const mediaService = require("../services/mediaService");
const { CreateSlideSchema, UpdateSlideSchema, formatSlideErrors } = require("../schemas/heroSlidesSchemas");

const MAX_SLIDES = 20;

// ── Cache (public) ──────────────────────────────────────────────────────────

let _cache = null;
const CACHE_TTL = 5 * 60 * 1000;

function getCached() {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.data;
  return null;
}
function setCache(data) {
  _cache = { data, expiresAt: Date.now() + CACHE_TTL };
}
function invalidateCache() {
  _cache = null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickFile(files, field) {
  return files?.[field]?.[0] ?? null;
}

function normalizeHref(href) {
  const v = String(href || "").trim();
  if (!v) return "/drones";
  if (v.startsWith("/") || v.startsWith("http://") || v.startsWith("https://")) return v;
  return `/${v}`;
}

async function processMediaUploads(files, existingSlide) {
  const result = { fields: {}, oldMedia: [] };

  const heroVideo = pickFile(files, "heroVideo");
  const heroImage = pickFile(files, "heroImage") || pickFile(files, "heroImageFallback");

  if (heroVideo) {
    if (!String(heroVideo.mimetype || "").startsWith("video/")) {
      throw new AppError("Arquivo de vídeo inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const [uploaded] = await mediaService.persistMedia([heroVideo], { folder: "hero" });
    result.fields.hero_video_path = uploaded.path;
    result.fields.hero_video_url = uploaded.path;
    if (existingSlide?.hero_video_path) result.oldMedia.push({ path: existingSlide.hero_video_path });
  }

  if (heroImage) {
    if (!String(heroImage.mimetype || "").startsWith("image/")) {
      throw new AppError("Arquivo de imagem inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const [uploaded] = await mediaService.persistMedia([heroImage], { folder: "hero" });
    result.fields.hero_image_path = uploaded.path;
    result.fields.hero_image_url = uploaded.path;
    if (existingSlide?.hero_image_path) result.oldMedia.push({ path: existingSlide.hero_image_path });
  }

  return result;
}

// ── Public ──────────────────────────────────────────────────────────────────

const listPublicSlides = async (req, res, next) => {
  try {
    let slides = getCached();
    if (!slides) {
      slides = await repo.findActiveSlides();
      setCache(slides);
    }
    if (typeof res.set === "function") {
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    } else if (typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    }
    return response.ok(res, slides);
  } catch (err) {
    console.error("[hero-slides] listPublicSlides error:", err);
    return next(new AppError("Erro ao carregar slides.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

// ── Admin ───────────────────────────────────────────────────────────────────

const listAdminSlides = async (req, res, next) => {
  try {
    const slides = await repo.findAllSlides(true);
    return response.ok(res, slides);
  } catch (err) {
    return next(new AppError("Erro ao listar slides.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getSlide = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    const slide = await repo.findSlideById(id);
    if (!slide) throw new AppError("Slide não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    return response.ok(res, slide);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar slide.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const createSlide = async (req, res, next) => {
  try {
    // Enforce slide limit
    const existing = await repo.findAllSlides(true);
    if (existing.length >= MAX_SLIDES) {
      throw new AppError(`Limite de ${MAX_SLIDES} slides atingido.`, ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const parsed = CreateSlideSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatSlideErrors(parsed.error),
      });
    }

    const fields = { ...parsed.data };
    fields.button_href = normalizeHref(fields.button_href);
    if (fields.button_secondary_href) {
      fields.button_secondary_href = normalizeHref(fields.button_secondary_href);
    }

    const media = await processMediaUploads(req.files, null);
    Object.assign(fields, media.fields);

    const id = await repo.insertSlide(fields);
    invalidateCache();

    const slide = await repo.findSlideById(id);
    return response.created(res, slide, "Slide criado.");
  } catch (err) {
    console.error("[hero-slides] createSlide error:", err);
    return next(err instanceof AppError ? err : new AppError(err?.message || "Erro ao criar slide.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const updateSlide = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const existing = await repo.findSlideById(id);
    if (!existing) throw new AppError("Slide não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    const parsed = UpdateSlideSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatSlideErrors(parsed.error),
      });
    }

    const fields = { ...parsed.data };
    fields.button_href = normalizeHref(fields.button_href);
    if (fields.button_secondary_href) {
      fields.button_secondary_href = normalizeHref(fields.button_secondary_href);
    }

    const media = await processMediaUploads(req.files, existing);
    Object.assign(fields, media.fields);

    await repo.updateSlide(id, fields);
    if (media.oldMedia.length) mediaService.enqueueOrphanCleanup(media.oldMedia);
    invalidateCache();

    const updated = await repo.findSlideById(id);
    return response.ok(res, updated, "Slide atualizado.");
  } catch (err) {
    console.error("[hero-slides] updateSlide error:", err);
    return next(err instanceof AppError ? err : new AppError(err?.message || "Erro ao atualizar slide.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const toggleSlide = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const existing = await repo.findSlideById(id);
    if (!existing) throw new AppError("Slide não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    const newStatus = existing.is_active ? 0 : 1;
    await repo.updateSlide(id, { is_active: newStatus });
    invalidateCache();

    return response.ok(res, { id, is_active: newStatus }, newStatus ? "Slide ativado." : "Slide desativado.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao alterar status.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const deleteSlideHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const existing = await repo.findSlideById(id);
    if (!existing) throw new AppError("Slide não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    await repo.deleteSlide(id);

    const oldMedia = [];
    if (existing.hero_video_path) oldMedia.push({ path: existing.hero_video_path });
    if (existing.hero_image_path) oldMedia.push({ path: existing.hero_image_path });
    if (oldMedia.length) mediaService.enqueueOrphanCleanup(oldMedia);

    invalidateCache();
    return response.ok(res, { id }, "Slide removido.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao remover slide.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = {
  listPublicSlides,
  listAdminSlides,
  getSlide,
  createSlide,
  updateSlide,
  toggleSlide,
  deleteSlide: deleteSlideHandler,
};
