"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const heroRepo = require("../repositories/heroRepository");
const mediaService = require("../services/mediaService");

function pickFile(files, field) {
  const arr = files?.[field];
  if (!arr || !arr.length) return null;
  return arr[0];
}

function normalizeHref(href) {
  const v = String(href || "").trim();
  if (!v) return "/drones";
  if (v.startsWith("/") || v.startsWith("http://") || v.startsWith("https://")) return v;
  return `/${v}`;
}

async function ensureSingleRow() {
  const id = await heroRepo.findHeroId();
  if (id != null) return id;
  return heroRepo.insertDefaultHeroRow();
}

async function getHeroBase() {
  await ensureSingleRow();

  const r = await heroRepo.findHeroSettings() || {};
  return {
    hero_video_url: r.hero_video_url || "",
    hero_video_path: r.hero_video_path || "",
    hero_image_url: r.hero_image_url || "",
    hero_image_path: r.hero_image_path || "",
    title: r.title || "",
    subtitle: r.subtitle || "",
    button_label: r.button_label || "Saiba Mais",
    button_href: normalizeHref(r.button_href || "/drones"),
    updated_at: r.updated_at || null,
    created_at: r.created_at || null,
  };
}

async function updateHeroRow(fields) {
  const id = await ensureSingleRow();
  await heroRepo.updateHeroSettings(id, fields);
}



exports.getHero = async (req, res) => {
  const data = await getHeroBase();
  return response.ok(res, data);
};

exports.getHeroPublic = async (req, res) => {
  const data = await getHeroBase();
  return response.ok(res, data);
};

exports.updateHero = async (req, res, next) => {
  try {
    // compat: aceita os 2 nomes
    const heroVideo =
      pickFile(req.files, "heroVideo") ||
      pickFile(req.files, "hero_video") ||
      pickFile(req.files, "video");

    const heroImage =
      pickFile(req.files, "heroImageFallback") ||
      pickFile(req.files, "heroImage") ||
      pickFile(req.files, "heroFallbackImage") ||
      pickFile(req.files, "hero_image") ||
      pickFile(req.files, "image");

    const labelRaw = req.body?.button_label ?? req.body?.hero_button_label;
    const hrefRaw = req.body?.button_href ?? req.body?.hero_button_href;
    const titleRaw = req.body?.title ?? req.body?.hero_title;
    const subtitleRaw = req.body?.subtitle ?? req.body?.hero_subtitle;

    const label = String(labelRaw || "").trim();
    const href = normalizeHref(hrefRaw);
    const title = String(titleRaw || "").trim();
    const subtitle = String(subtitleRaw || "").trim();

    if (label && label.length > 80) {
      throw new AppError("Label do botão muito grande.", ERROR_CODES.VALIDATION_ERROR, 400, {
        field: "button_label",
        max: 80,
      });
    }

    if (title && title.length > 255) {
      throw new AppError("Título muito grande.", ERROR_CODES.VALIDATION_ERROR, 400, {
        field: "title",
        max: 255,
      });
    }

    if (subtitle && subtitle.length > 500) {
      throw new AppError("Subtítulo muito grande.", ERROR_CODES.VALIDATION_ERROR, 400, {
        field: "subtitle",
        max: 500,
      });
    }

    const patch = {};

    if (label) patch.button_label = label;
    if (href) patch.button_href = href;
    if (title) patch.title = title;
    if (subtitle) patch.subtitle = subtitle;

    if (heroVideo) {
      if (!String(heroVideo.mimetype || "").startsWith("video/")) {
        throw new AppError("Arquivo de vídeo inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
          field: "heroVideo",
        });
      }
      const [uploaded] = await mediaService.persistMedia([heroVideo], { folder: "hero" });
      patch.hero_video_path = uploaded.path;
      patch.hero_video_url = uploaded.path;
    }

    if (heroImage) {
      if (!String(heroImage.mimetype || "").startsWith("image/")) {
        throw new AppError("Arquivo de imagem inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
          field: "heroImage",
        });
      }
      const [uploaded] = await mediaService.persistMedia([heroImage], { folder: "hero" });
      patch.hero_image_path = uploaded.path;
      patch.hero_image_url = uploaded.path;
    }

    await updateHeroRow(patch);

    const updated = await getHeroBase();
    return response.ok(res, { hero: updated });
  } catch (err) {
    console.error("[site-hero] updateHero error:", err);
    return next(err instanceof AppError ? err : new AppError(err?.message || "Erro ao atualizar Hero.", ERROR_CODES.SERVER_ERROR, 500, err?.details || null));
  }
};
