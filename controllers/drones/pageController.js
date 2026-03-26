"use strict";

const dronesService = require("../../services/dronesService");
const mediaService = require("../../services/mediaService");
const AppError = require("../../errors/AppError");
const { safeUnlink, classify, parseJsonField, sendError, MAX_VIDEO_BYTES, MAX_IMAGE_BYTES } = require("./helpers");

async function getPage(req, res) {
  try {
    const row = await dronesService.getPageSettings();
    if (!row) return res.json(null);

    return res.json({
      ...row,
      specs_items_json: parseJsonField(row.specs_items_json),
      features_items_json: parseJsonField(row.features_items_json),
      benefits_items_json: parseJsonField(row.benefits_items_json),
      sections_order_json: parseJsonField(row.sections_order_json),
      models_json: parseJsonField(row.models_json),
    });
  } catch (e) {
    console.error("[drones/admin] getPage error:", e);
    return sendError(res, new AppError("Erro ao carregar config.", "SERVER_ERROR", 500));
  }
}

async function upsertPage(req, res) {
  const heroVideo = req.files?.heroVideo?.[0] || null;
  const heroImageFallback = req.files?.heroImageFallback?.[0] || null;

  try {
    const body = req.body || {};

    const hero_title = dronesService.sanitizeText(body.hero_title, 120);
    if (!hero_title) {
      if (heroVideo) safeUnlink(heroVideo);
      if (heroImageFallback) safeUnlink(heroImageFallback);
      throw new AppError("hero_title é obrigatório.", "VALIDATION_ERROR", 400, { field: "hero_title" });
    }

    const specs_items_json = body.specs_items_json ? JSON.parse(body.specs_items_json) : null;
    const features_items_json = body.features_items_json ? JSON.parse(body.features_items_json) : null;
    const benefits_items_json = body.benefits_items_json ? JSON.parse(body.benefits_items_json) : null;
    const sections_order_json = body.sections_order_json ? JSON.parse(body.sections_order_json) : null;
    const models_json = body.models_json ? JSON.parse(body.models_json) : null;

    const payload = {
      hero_title,
      hero_subtitle: dronesService.sanitizeText(body.hero_subtitle, 255) || null,
      hero_video_path: body.hero_video_path || null,
      hero_image_fallback_path: body.hero_image_fallback_path || null,

      cta_title: dronesService.sanitizeText(body.cta_title, 120) || null,
      cta_message_template: dronesService.sanitizeText(body.cta_message_template, 500) || null,
      cta_button_label: dronesService.sanitizeText(body.cta_button_label, 60) || null,

      specs_title: dronesService.sanitizeText(body.specs_title, 120) || null,
      specs_items_json,
      features_title: dronesService.sanitizeText(body.features_title, 120) || null,
      features_items_json,
      benefits_title: dronesService.sanitizeText(body.benefits_title, 120) || null,
      benefits_items_json,

      sections_order_json,
      models_json,
    };

    if (heroVideo) {
      const info = classify(heroVideo);
      if (!info || info.media_type !== "VIDEO") {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo inválido. Aceito: mp4 até 30MB.", "VALIDATION_ERROR", 400, {
          field: "heroVideo", allowed: ["video/mp4"],
        });
      }
      if (Number(heroVideo.size || 0) > MAX_VIDEO_BYTES) {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo excede 30MB.", "VALIDATION_ERROR", 400, { field: "heroVideo", maxBytes: MAX_VIDEO_BYTES });
      }
      const saved = await mediaService.persistMedia([heroVideo], { folder: "drones" });
      payload.hero_video_path = saved?.[0]?.path || payload.hero_video_path;
    }

    if (heroImageFallback) {
      const info = classify(heroImageFallback);
      if (!info || info.media_type !== "IMAGE") {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback inválido. Aceito: jpg/png/webp até 5MB.", "VALIDATION_ERROR", 400, {
          field: "heroImageFallback", allowed: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      if (Number(heroImageFallback.size || 0) > MAX_IMAGE_BYTES) {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback excede 5MB.", "VALIDATION_ERROR", 400, {
          field: "heroImageFallback", maxBytes: MAX_IMAGE_BYTES,
        });
      }
      const saved = await mediaService.persistMedia([heroImageFallback], { folder: "drones" });
      payload.hero_image_fallback_path = saved?.[0]?.path || payload.hero_image_fallback_path;
    }

    const saved = await dronesService.upsertPageSettings(payload);
    return res.json({ message: "Configuração salva.", page: saved });
  } catch (e) {
    console.error("[drones/admin] upsertPage error:", e);
    if (heroVideo) safeUnlink(heroVideo);
    if (heroImageFallback) safeUnlink(heroImageFallback);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar config.", "SERVER_ERROR", 500));
  }
}

async function resetPageToDefault(req, res) {
  try {
    const payload = {
      hero_title: "Kavita Drones",
      hero_subtitle: "Drones agrícolas com performance, segurança e suporte local.",
      hero_video_path: null,
      hero_image_fallback_path: null,

      cta_title: null,
      cta_message_template: "Olá! Quero conhecer melhor os drones da Kavita.",
      cta_button_label: "Fale com um representante",

      specs_title: "Especificações",
      specs_items_json: null,
      features_title: "Funcionalidades",
      features_items_json: null,
      benefits_title: "Benefícios",
      benefits_items_json: null,

      sections_order_json: ["hero", "specs", "features", "benefits", "gallery", "representatives", "comments"],

      models_json: null,
    };

    await dronesService.upsertPageSettings(payload);
    return res.json({ message: "Página resetada para padrão." });
  } catch (e) {
    console.error("[drones/admin] resetPageToDefault error:", e);
    return sendError(res, new AppError("Erro ao resetar.", "SERVER_ERROR", 500));
  }
}

async function getLandingConfig(req, res) {
  try {
    const row = await dronesService.getPageSettings();
    if (!row) return res.json(null);

    return res.json({
      hero_title: row.hero_title || null,
      hero_subtitle: row.hero_subtitle || null,
      hero_video_path: row.hero_video_path || null,
      hero_image_fallback_path: row.hero_image_fallback_path || null,

      cta_title: row.cta_title || null,
      cta_message_template: row.cta_message_template || null,
      cta_button_label: row.cta_button_label || null,

      sections_order_json: parseJsonField(row.sections_order_json),
    });
  } catch (e) {
    console.error("[drones/admin] getLandingConfig error:", e);
    return sendError(res, new AppError("Erro ao carregar Config Landing.", "SERVER_ERROR", 500));
  }
}

async function upsertLandingConfig(req, res) {
  const heroVideo = req.files?.heroVideo?.[0] || null;
  const heroImageFallback = req.files?.heroImageFallback?.[0] || null;

  try {
    const body = req.body || {};
    const hero_title = dronesService.sanitizeText(body.hero_title, 120);
    if (!hero_title) {
      if (heroVideo) safeUnlink(heroVideo);
      if (heroImageFallback) safeUnlink(heroImageFallback);
      throw new AppError("hero_title é obrigatório.", "VALIDATION_ERROR", 400, { field: "hero_title" });
    }

    const sections_order_json = body.sections_order_json ? JSON.parse(body.sections_order_json) : null;

    const payload = {
      hero_title,
      hero_subtitle: dronesService.sanitizeText(body.hero_subtitle, 255) || null,
      hero_video_path: body.hero_video_path || null,
      hero_image_fallback_path: body.hero_image_fallback_path || null,

      cta_title: dronesService.sanitizeText(body.cta_title, 120) || null,
      cta_message_template: dronesService.sanitizeText(body.cta_message_template, 500) || null,
      cta_button_label: dronesService.sanitizeText(body.cta_button_label, 60) || null,

      sections_order_json,
    };

    if (heroVideo) {
      const info = classify(heroVideo);
      if (!info || info.media_type !== "VIDEO") {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo inválido. Aceito: mp4 até 30MB.", "VALIDATION_ERROR", 400, {
          field: "heroVideo", allowed: ["video/mp4"],
        });
      }
      if (Number(heroVideo.size || 0) > MAX_VIDEO_BYTES) {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo excede 30MB.", "VALIDATION_ERROR", 400, { field: "heroVideo", maxBytes: MAX_VIDEO_BYTES });
      }
      const saved = await mediaService.persistMedia([heroVideo], { folder: "drones" });
      payload.hero_video_path = saved?.[0]?.path || payload.hero_video_path;
    }

    if (heroImageFallback) {
      const info = classify(heroImageFallback);
      if (!info || info.media_type !== "IMAGE") {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback inválido. Aceito: jpg/png/webp até 5MB.", "VALIDATION_ERROR", 400, {
          field: "heroImageFallback", allowed: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      if (Number(heroImageFallback.size || 0) > MAX_IMAGE_BYTES) {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback excede 5MB.", "VALIDATION_ERROR", 400, {
          field: "heroImageFallback", maxBytes: MAX_IMAGE_BYTES,
        });
      }
      const saved = await mediaService.persistMedia([heroImageFallback], { folder: "drones" });
      payload.hero_image_fallback_path = saved?.[0]?.path || payload.hero_image_fallback_path;
    }

    const saved = await dronesService.upsertPageSettings(payload);
    return res.json({ message: "Config Landing salva.", config: saved });
  } catch (e) {
    console.error("[drones/admin] upsertLandingConfig error:", e);
    if (heroVideo) safeUnlink(heroVideo);
    if (heroImageFallback) safeUnlink(heroImageFallback);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar Config Landing.", "SERVER_ERROR", 500));
  }
}

module.exports = { getPage, upsertPage, resetPageToDefault, getLandingConfig, upsertLandingConfig };
