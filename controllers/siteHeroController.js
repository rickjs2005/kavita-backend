"use strict";
// controllers/siteHeroController.js
// Pair: routes/admin/adminSiteHero.js + routes/public/publicSiteHero.js

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const heroRepo = require("../repositories/heroRepository");
const mediaService = require("../services/mediaService");
const { UpdateHeroSchema } = require("../schemas/heroSchemas");

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickFile(files, field) {
  const arr = files?.[field];
  return arr?.[0] ?? null;
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

  const r = (await heroRepo.findHeroSettings()) || {};
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

// ── Handlers ────────────────────────────────────────────────────────────────

const getHero = async (req, res) => {
  const data = await getHeroBase();
  return response.ok(res, data);
};

const getHeroPublic = async (req, res) => {
  const data = await getHeroBase();
  if (typeof res.set === "function") {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  } else if (typeof res.setHeader === "function") {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  }
  return response.ok(res, data);
};

const updateHero = async (req, res, next) => {
  try {
    // ── Validate text fields via Zod ──────────────────────────────────────
    const parsed = UpdateHeroSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      throw new AppError(firstIssue.message, ERROR_CODES.VALIDATION_ERROR, 400, { fields });
    }

    const { title, subtitle, button_label, button_href } = parsed.data;

    // ── Validate files ────────────────────────────────────────────────────
    const heroVideo = pickFile(req.files, "heroVideo");
    const heroImage =
      pickFile(req.files, "heroImageFallback") ||
      pickFile(req.files, "heroFallbackImage") ||
      pickFile(req.files, "heroImage");

    if (heroVideo && !String(heroVideo.mimetype || "").startsWith("video/")) {
      throw new AppError("Arquivo de vídeo inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
        field: "heroVideo",
      });
    }

    if (heroImage && !String(heroImage.mimetype || "").startsWith("image/")) {
      throw new AppError("Arquivo de imagem inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
        field: "heroImage",
      });
    }

    // ── Build patch ───────────────────────────────────────────────────────
    const patch = {};
    const oldMedia = [];

    if (title) patch.title = title;
    if (subtitle) patch.subtitle = subtitle;
    if (button_label) patch.button_label = button_label;
    if (button_href) patch.button_href = normalizeHref(button_href);

    // Fetch current paths before overwriting (for cleanup)
    const current = (heroVideo || heroImage) ? await getHeroBase() : null;

    if (heroVideo) {
      const [uploaded] = await mediaService.persistMedia([heroVideo], { folder: "hero" });
      patch.hero_video_path = uploaded.path;
      patch.hero_video_url = uploaded.path;
      if (current?.hero_video_path) {
        oldMedia.push({ path: current.hero_video_path });
      }
    }

    if (heroImage) {
      const [uploaded] = await mediaService.persistMedia([heroImage], { folder: "hero" });
      patch.hero_image_path = uploaded.path;
      patch.hero_image_url = uploaded.path;
      if (current?.hero_image_path) {
        oldMedia.push({ path: current.hero_image_path });
      }
    }

    if (Object.keys(patch).length > 0) {
      await updateHeroRow(patch);
    }

    // Cleanup old media files (fire-and-forget)
    if (oldMedia.length) {
      mediaService.enqueueOrphanCleanup(oldMedia);
    }

    const updated = await getHeroBase();
    return response.ok(res, { hero: updated });
  } catch (err) {
    console.error("[site-hero] updateHero error:", err);
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            err?.message || "Erro ao atualizar Hero.",
            ERROR_CODES.SERVER_ERROR,
            500,
            err?.details || null,
          ),
    );
  }
};

module.exports = { getHero, getHeroPublic, updateHero };
