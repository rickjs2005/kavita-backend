"use strict";

const AppError = require("../errors/AppError");
const pool = require("../config/pool");

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
  const [rows] = await pool.query("SELECT id FROM site_hero_settings LIMIT 1");
  if (rows?.length) return rows[0].id;

  const [result] = await pool.query(
    "INSERT INTO site_hero_settings (button_label, button_href) VALUES (?, ?)",
    ["Saiba Mais", "/drones"]
  );
  return result.insertId;
}

async function getHeroBase() {
  await ensureSingleRow();

  const [rows] = await pool.query(
    `SELECT
        hero_video_url, hero_video_path,
        hero_image_url, hero_image_path,
        title, subtitle,
        button_label, button_href,
        updated_at, created_at
     FROM site_hero_settings
     ORDER BY id ASC
     LIMIT 1`
  );

  const r = rows?.[0] || {};
  return {
    hero_video_url: r.hero_video_url || "",
    hero_video_path: r.hero_video_path || "",
    hero_image_url: r.hero_image_url || "",
    hero_image_path: r.hero_image_path || "",

    // ✅ opcionais
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
  await pool.query("UPDATE site_hero_settings SET ? WHERE id = ?", [fields, id]);
}

function fileToPublicPath(file) {
  // padrão mais comum: servir /uploads/<filename>
  // se seu storage for diferente, ajuste aqui
  return `/uploads/${file.filename}`;
}

exports.getHero = async (req, res) => {
  const data = await getHeroBase();
  return res.json(data);
};

exports.getHeroPublic = async (req, res) => {
  const data = await getHeroBase();
  return res.json(data);
};

exports.updateHero = async (req, res) => {
  try {
    // compat: aceita os 2 nomes
    const heroVideo =
      pickFile(req.files, "heroVideo") ||
      pickFile(req.files, "hero_video") ||
      pickFile(req.files, "video"); // compat extra

    const heroImage =
      pickFile(req.files, "heroImageFallback") || // ✅ o seu mais provável
      pickFile(req.files, "heroImage") ||
      pickFile(req.files, "heroFallbackImage") ||
      pickFile(req.files, "hero_image") ||
      pickFile(req.files, "image"); // compat extra

    const labelRaw = req.body?.button_label ?? req.body?.hero_button_label;
    const hrefRaw = req.body?.button_href ?? req.body?.hero_button_href;

    // ✅ NOVO (opcional): title/subtitle (mantém lógica: só atualiza se vier preenchido)
    const titleRaw = req.body?.title ?? req.body?.hero_title;
    const subtitleRaw = req.body?.subtitle ?? req.body?.hero_subtitle;

    const label = String(labelRaw || "").trim();
    const href = normalizeHref(hrefRaw);

    const title = String(titleRaw || "").trim();
    const subtitle = String(subtitleRaw || "").trim();

    if (label && label.length > 80) {
      throw new AppError("Label do botão muito grande.", 400, "VALIDATION_ERROR", {
        field: "button_label",
        max: 80,
      });
    }

    // limites coerentes com sua tabela (title 255 / subtitle 500)
    if (title && title.length > 255) {
      throw new AppError("Título muito grande.", 400, "VALIDATION_ERROR", {
        field: "title",
        max: 255,
      });
    }

    if (subtitle && subtitle.length > 500) {
      throw new AppError("Subtítulo muito grande.", 400, "VALIDATION_ERROR", {
        field: "subtitle",
        max: 500,
      });
    }

    const patch = {};

    // atualiza label/href (mesma lógica de antes)
    if (label) patch.button_label = label;
    if (href) patch.button_href = href;

    // ✅ atualiza title/subtitle só se vier preenchido (não obriga)
    if (title) patch.title = title;
    if (subtitle) patch.subtitle = subtitle;

    if (heroVideo) {
      if (!String(heroVideo.mimetype || "").startsWith("video/")) {
        throw new AppError("Arquivo de vídeo inválido.", 400, "VALIDATION_ERROR", {
          field: "heroVideo",
        });
      }
      const publicPath = fileToPublicPath(heroVideo);
      patch.hero_video_path = publicPath;
      patch.hero_video_url = publicPath;
    }

    if (heroImage) {
      if (!String(heroImage.mimetype || "").startsWith("image/")) {
        throw new AppError("Arquivo de imagem inválido.", 400, "VALIDATION_ERROR", {
          field: "heroImage",
        });
      }
      const publicPath = fileToPublicPath(heroImage);
      patch.hero_image_path = publicPath;
      patch.hero_image_url = publicPath;
    }

    await updateHeroRow(patch);

    const updated = await getHeroBase();
    return res.json({ ok: true, hero: updated });
  } catch (err) {
    console.error("[site-hero] updateHero error:", err);
    const status = err?.statusCode || 500;
    return res.status(status).json({
      status,
      code: err?.code || "INTERNAL_ERROR",
      message: err?.message || "Erro ao atualizar Hero.",
      details: err?.details || null,
    });
  }
};
