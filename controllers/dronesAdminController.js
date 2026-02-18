// controllers/dronesAdminController.js
const fs = require("fs");
const dronesService = require("../services/dronesService");
const mediaService = require("../services/mediaService");

/**
 * AppError fallback (compatível):
 * - Se seu projeto já tem AppError global, troque este require pelo caminho real e remova a classe abaixo.
 * - Mantive aqui para garantir o padrão pedido (status/code/message/details) mesmo sem depender do path.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = "SERVER_ERROR", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

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

/**
 * ✅ NOVO: validação do modelKey por formato (regex), sem depender de listModels.
 * Isso evita o bug de "não consigo excluir" quando listDroneModels falha e cai no DEFAULT.
 */
function parseModelKey(modelKey) {
  const key = String(modelKey || "").trim().toLowerCase();

  if (!key) {
    throw new AppError("Modelo inválido", 400, "VALIDATION_ERROR", {
      field: "modelKey",
      reason: "empty",
    });
  }

  // Mesmo padrão do createModel: a-z, 0-9, _; 2-20 chars
  if (!/^[a-z0-9_]{2,20}$/.test(key)) {
    throw new AppError("Modelo inválido", 400, "VALIDATION_ERROR", {
      field: "modelKey",
      reason: "format",
      example: "t25p",
    });
  }

  return key;
}

/**
 * ✅ NOVO: garante existência no DB quando a operação exige
 */
async function ensureModelExists(modelKey) {
  const existing = await dronesService.getDroneModelByKey(modelKey);
  if (!existing) {
    throw new AppError("Modelo não encontrado.", 404, "NOT_FOUND", { modelKey });
  }
  return existing;
}

function sendError(res, err) {
  const status = err?.statusCode || 500;
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

/**
 * =========================================================
 * LEGADO: PAGE (mantém compatibilidade total)
 * GET/PUT/POST /api/admin/drones/page
 * =========================================================
 * ATENÇÃO: no novo fluxo, Config Landing NÃO deve conter specs/features/benefits/galeria,
 * mas o endpoint /page segue existindo para não quebrar o front antigo.
 */
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

      // NOVO: modelos em JSON (armazenamento do conteúdo por modelo)
      models_json: parseJsonField(row.models_json),
    });
  } catch (e) {
    console.error("[drones/admin] getPage error:", e);
    return sendError(res, new AppError("Erro ao carregar config.", 500, "SERVER_ERROR"));
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
      throw new AppError("hero_title é obrigatório.", 400, "VALIDATION_ERROR", { field: "hero_title" });
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

      // LEGADO
      specs_title: dronesService.sanitizeText(body.specs_title, 120) || null,
      specs_items_json,
      features_title: dronesService.sanitizeText(body.features_title, 120) || null,
      features_items_json,
      benefits_title: dronesService.sanitizeText(body.benefits_title, 120) || null,
      benefits_items_json,

      sections_order_json,

      // NOVO
      models_json,
    };

    // Upload heroVideo
    if (heroVideo) {
      const info = classify(heroVideo);
      if (!info || info.media_type !== "VIDEO") {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo inválido. Aceito: mp4 até 30MB.", 400, "VALIDATION_ERROR", {
          field: "heroVideo",
          allowed: ["video/mp4"],
        });
      }
      if (Number(heroVideo.size || 0) > MAX_VIDEO_BYTES) {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo excede 30MB.", 400, "VALIDATION_ERROR", { field: "heroVideo", maxBytes: MAX_VIDEO_BYTES });
      }
      const saved = await mediaService.persistMedia([heroVideo], { folder: "drones" });
      payload.hero_video_path = saved?.[0]?.path || payload.hero_video_path;
    }

    // Upload heroImageFallback
    if (heroImageFallback) {
      const info = classify(heroImageFallback);
      if (!info || info.media_type !== "IMAGE") {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback inválido. Aceito: jpg/png/webp até 5MB.", 400, "VALIDATION_ERROR", {
          field: "heroImageFallback",
          allowed: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      if (Number(heroImageFallback.size || 0) > MAX_IMAGE_BYTES) {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback excede 5MB.", 400, "VALIDATION_ERROR", {
          field: "heroImageFallback",
          maxBytes: MAX_IMAGE_BYTES,
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
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar config.", 500, "SERVER_ERROR"));
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
    return sendError(res, new AppError("Erro ao resetar.", 500, "SERVER_ERROR"));
  }
}

/**
 * =========================================================
 * NOVO: CONFIG LANDING (sem specs/features/benefits/galeria)
 * GET/PUT /api/admin/drones/config
 * =========================================================
 */
async function getLandingConfig(req, res) {
  try {
    const row = await dronesService.getPageSettings();
    if (!row) return res.json(null);

    // entrega somente o que é “landing config”
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
    return sendError(res, new AppError("Erro ao carregar Config Landing.", 500, "SERVER_ERROR"));
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
      throw new AppError("hero_title é obrigatório.", 400, "VALIDATION_ERROR", { field: "hero_title" });
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

      // IMPORTANTE: não mexe em specs/features/benefits/models_json aqui
    };

    // Upload heroVideo
    if (heroVideo) {
      const info = classify(heroVideo);
      if (!info || info.media_type !== "VIDEO") {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo inválido. Aceito: mp4 até 30MB.", 400, "VALIDATION_ERROR", {
          field: "heroVideo",
          allowed: ["video/mp4"],
        });
      }
      if (Number(heroVideo.size || 0) > MAX_VIDEO_BYTES) {
        safeUnlink(heroVideo);
        throw new AppError("heroVideo excede 30MB.", 400, "VALIDATION_ERROR", { field: "heroVideo", maxBytes: MAX_VIDEO_BYTES });
      }
      const saved = await mediaService.persistMedia([heroVideo], { folder: "drones" });
      payload.hero_video_path = saved?.[0]?.path || payload.hero_video_path;
    }

    // Upload heroImageFallback
    if (heroImageFallback) {
      const info = classify(heroImageFallback);
      if (!info || info.media_type !== "IMAGE") {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback inválido. Aceito: jpg/png/webp até 5MB.", 400, "VALIDATION_ERROR", {
          field: "heroImageFallback",
          allowed: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      if (Number(heroImageFallback.size || 0) > MAX_IMAGE_BYTES) {
        safeUnlink(heroImageFallback);
        throw new AppError("heroImageFallback excede 5MB.", 400, "VALIDATION_ERROR", {
          field: "heroImageFallback",
          maxBytes: MAX_IMAGE_BYTES,
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
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar Config Landing.", 500, "SERVER_ERROR"));
  }
}

/**
 * =========================================================
 * NOVO: MODELOS (dinâmicos via drone_models)
 * GET /api/admin/drones/models
 * POST /api/admin/drones/models
 * DELETE /api/admin/drones/models/:modelKey (?hard=1)
 * GET /api/admin/drones/models/:modelKey
 * PUT /api/admin/drones/models/:modelKey
 * =========================================================
 */
async function listModels(req, res) {
  try {
    const includeInactive = String(req.query.includeInactive || "0") === "1";
    const items = await dronesService.listDroneModels({ includeInactive });
    return res.json({
      items: (Array.isArray(items) && items.length) ? items : DEFAULT_DRONE_MODELS
    });
  } catch (e) {
    console.error("[drones/admin] listModels error:", e);
    return sendError(res, new AppError("Erro ao listar modelos.", 500, "SERVER_ERROR"));
  }
}

async function createModel(req, res) {
  try {
    const body = req.body || {};

    const key = String(body.key || "").trim().toLowerCase();
    const label = dronesService.sanitizeText(body.label, 120);

    if (!key) throw new AppError("key é obrigatório.", 400, "VALIDATION_ERROR", { field: "key" });
    if (!/^[a-z0-9_]{2,20}$/.test(key)) {
      throw new AppError("key inválido (use a-z, 0-9, _; 2-20 chars).", 400, "VALIDATION_ERROR", { field: "key" });
    }
    if (!label) throw new AppError("label é obrigatório.", 400, "VALIDATION_ERROR", { field: "label" });

    const sort_order = Number(body.sort_order) || 0;
    const is_active = body.is_active === undefined ? 1 : (String(body.is_active) === "1" ? 1 : 0);

    try {
      await dronesService.createDroneModel({ key, label, sort_order, is_active });
    } catch (e) {
      if (e?.code === "DUPLICATE_MODEL_KEY" || e?.message === "DUPLICATE_MODEL_KEY") {
        throw new AppError("Já existe um modelo com esse key.", 409, "CONFLICT", { field: "key", key });
      }
      throw e;
    }

    return res.status(201).json({ message: "Modelo criado.", key });
  } catch (e) {
    console.error("[drones/admin] createModel error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao criar modelo.", 500, "SERVER_ERROR"));
  }
}

async function deleteModel(req, res) {
  try {
    // ✅ não depende mais de listModels para validar
    const modelKey = parseModelKey(req.params.modelKey);

    const hard = String(req.query.hard || "0") === "1";

    // ✅ garante existência no DB (inclui inativos, desde que getDroneModelByKey retorne)
    await ensureModelExists(modelKey);

    if (hard) {
      await dronesService.hardDeleteDroneModel(modelKey);
      return res.json({ message: "Modelo removido definitivamente.", modelKey });
    }

    await dronesService.softDeleteDroneModel(modelKey);
    return res.json({ message: "Modelo desativado.", modelKey });
  } catch (e) {
    console.error("[drones/admin] deleteModel error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao excluir modelo.", 500, "SERVER_ERROR"));
  }
}

async function getModelAggregate(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);

    // ✅ opcional: se quiser exigir que exista no DB, mantém:
    const modelRow = await ensureModelExists(modelKey);

    const row = await dronesService.getPageSettings();
    const models_json = parseJsonField(row?.models_json) || {};

    const modelData = models_json?.[modelKey] || null;

    // galeria filtrada por model_key (fallback: se nada, retorna [])
    const galleryResult = await dronesService.listGalleryAdmin({ page: 1, limit: 1000, model_key: modelKey });
    const gallery = extractItems(galleryResult).filter((g) => String(g.model_key || "") === modelKey);

    return res.json({
      model: { key: modelRow.key, label: modelRow.label },
      data: modelData,
      gallery,
    });
  } catch (e) {
    console.error("[drones/admin] getModelAggregate error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao carregar modelo.", 500, "SERVER_ERROR"));
  }
}

async function upsertModelInfo(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);

    // exige existir
    await ensureModelExists(modelKey);

    const body = req.body || {};

    // PATCH: só aplica campo se veio no body
    const patch = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

    if (has("specs_title")) {
      patch.specs_title = dronesService.sanitizeText(body.specs_title, 120) || null;
    }
    if (has("specs_items_json")) {
      patch.specs_items_json = Array.isArray(body.specs_items_json) ? body.specs_items_json : [];
    }

    if (has("features_title")) {
      patch.features_title = dronesService.sanitizeText(body.features_title, 120) || null;
    }
    if (has("features_items_json")) {
      patch.features_items_json = Array.isArray(body.features_items_json) ? body.features_items_json : [];
    }

    if (has("benefits_title")) {
      patch.benefits_title = dronesService.sanitizeText(body.benefits_title, 120) || null;
    }
    if (has("benefits_items_json")) {
      patch.benefits_items_json = Array.isArray(body.benefits_items_json) ? body.benefits_items_json : [];
    }

    // validação: se mandou items, tem que ser array
    const badJson =
      (has("specs_items_json") && !Array.isArray(body.specs_items_json)) ||
      (has("features_items_json") && !Array.isArray(body.features_items_json)) ||
      (has("benefits_items_json") && !Array.isArray(body.benefits_items_json));

    if (badJson) {
      throw new AppError(
        "Envie specs_items_json/features_items_json/benefits_items_json como ARRAY (JSON), não string.",
        400,
        "VALIDATION_ERROR"
      );
    }

    const cur = await dronesService.getPageSettings();
    const models_json = parseJsonField(cur?.models_json) || {};

    models_json[modelKey] = {
      ...(models_json[modelKey] || {}),
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const saved = await dronesService.upsertPageSettings({ models_json });

    return res.json({
      message: "Modelo atualizado.",
      modelKey,
      models_json: parseJsonField(saved?.models_json) || models_json,
    });
  } catch (e) {
    console.error("[drones/admin] upsertModelInfo error:", e);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao salvar modelo.", 500, "SERVER_ERROR")
    );
  }
}

async function setModelMediaSelection(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const { target, media_id } = req.body || {};

    const t = String(target || "").trim().toUpperCase();
    if (!["HERO", "CARD"].includes(t)) {
      throw new AppError("target inválido. Use HERO ou CARD.", 400, "VALIDATION_ERROR", {
        field: "target",
      });
    }

    const id = Number(media_id);
    if (!id) {
      throw new AppError("media_id inválido.", 400, "VALIDATION_ERROR", { field: "media_id" });
    }

    // ✅ garante que a mídia existe e pertence ao modelKey
    const galleryResult = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const items = extractItems(galleryResult);

    const found = items.find((x) => Number(x.id) === id);
    if (!found) throw new AppError("Mídia não encontrada.", 404, "NOT_FOUND", { id });

    if (String(found.model_key || "").trim().toLowerCase() !== modelKey) {
      throw new AppError("Mídia não pertence a este modelo.", 403, "FORBIDDEN", { id, modelKey });
    }

    // ✅ NOVO: salva no drone_models
    await dronesService.upsertModelSelection(modelKey, t, id);

    // devolve o model atualizado (pra UI refletir)
    const updated = await dronesService.getDroneModelByKey(modelKey);

    return res.json({
      message: "Seleção salva.",
      modelKey,
      target: t,
      media_id: id,
      model: updated,
    });
  } catch (e) {
    console.error("[drones/admin] setModelMediaSelection error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar seleção.", 500));
  }
}

/**
 * =========================================================
 * NOVO: GALERIA POR MODELO
 * GET /api/admin/drones/models/:modelKey/gallery?active=1
 * POST /api/admin/drones/models/:modelKey/gallery (multipart)
 * PUT /api/admin/drones/models/:modelKey/gallery/:id (multipart opcional)
 * DELETE /api/admin/drones/models/:modelKey/gallery/:id
 * =========================================================
 */

async function listModelGallery(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const onlyActive =
      req.query.active !== undefined ? normalizeBool(req.query.active, true) : null;

    // ✅ lista geral e filtra no controller (não depende do filtro do service)
    const result = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const rows = extractItems(result);

    let out = rows.filter(
      (x) => String(x.model_key || "").trim().toLowerCase() === modelKey
    );

    if (onlyActive !== null) {
      out = out.filter((x) => Boolean(x.is_active) === Boolean(onlyActive));
    }

    out.sort(
      (a, b) =>
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
        (Number(a.id) || 0) - (Number(b.id) || 0)
    );

    return res.json(out);
  } catch (e) {
    console.error("[drones/admin] listModelGallery error:", e);
    return sendError(
      res,
      e instanceof AppError
        ? e
        : new AppError("Erro ao listar galeria do modelo.", 500, "SERVER_ERROR")
    );
  }
}

async function createModelGalleryItem(req, res) {
  const file = req.file;
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    if (!file) {
      throw new AppError("media é obrigatório.", 400, "VALIDATION_ERROR", { field: "media" });
    }

    const info = classify(file);
    if (!info) {
      safeUnlink(file);
      throw new AppError("Arquivo inválido. Aceito: jpg/png/webp/mp4.", 400, "VALIDATION_ERROR", {
        field: "media",
        allowed: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
      });
    }
    if (Number(file.size || 0) > info.max) {
      safeUnlink(file);
      throw new AppError(
        info.media_type === "VIDEO" ? "Vídeo > 30MB." : "Imagem > 5MB.",
        400,
        "VALIDATION_ERROR",
        { field: "media", maxBytes: info.max }
      );
    }

    const caption = dronesService.sanitizeText(req.body?.caption, 160) || null;
    const sort_order = Number(req.body?.sort_order) || 0;
    const is_active = normalizeBool(req.body?.is_active, true);

    const saved = await mediaService.persistMedia([file], { folder: "drones" });

    const id = await dronesService.createGalleryItem({
      model_key: modelKey,
      media_type: info.media_type,
      media_path: saved?.[0]?.path,
      caption,
      sort_order,
      is_active,
    });

    return res.status(201).json({ message: "Item criado.", id });
  } catch (e) {
    console.error("[drones/admin] createModelGalleryItem error:", e);
    if (file) safeUnlink(file);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao criar item.", 500, "SERVER_ERROR")
    );
  }
}

async function updateModelGalleryItem(req, res) {
  const file = req.file;
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const id = Number(req.params.id);
    if (!id) {
      if (file) safeUnlink(file);
      throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });
    }

    const caption = dronesService.sanitizeText(req.body?.caption, 160) || null;
    const sort_order = Number(req.body?.sort_order) || 0;
    const is_active = normalizeBool(req.body?.is_active, true);

    // ✅ pega o item real na lista (paginado)
    const result = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const list = extractItems(result);

    const cur = list.find((x) => Number(x.id) === id);
    if (!cur) {
      if (file) safeUnlink(file);
      throw new AppError("Item não encontrado.", 404, "NOT_FOUND", { id });
    }

    if (String(cur.model_key || "").trim().toLowerCase() !== modelKey) {
      if (file) safeUnlink(file);
      throw new AppError("Item não pertence a este modelo.", 403, "FORBIDDEN", {
        id,
        modelKey,
        curModelKey: cur.model_key,
      });
    }

    let media_type = cur.media_type;
    let media_path = cur.media_path;

    if (file) {
      const info = classify(file);
      if (!info) {
        safeUnlink(file);
        throw new AppError("Arquivo inválido.", 400, "VALIDATION_ERROR", { field: "media" });
      }
      if (Number(file.size || 0) > info.max) {
        safeUnlink(file);
        throw new AppError(
          info.media_type === "VIDEO" ? "Vídeo > 30MB." : "Imagem > 5MB.",
          400,
          "VALIDATION_ERROR",
          { field: "media", maxBytes: info.max }
        );
      }

      const saved = await mediaService.persistMedia([file], { folder: "drones" });
      media_type = info.media_type;
      media_path = saved?.[0]?.path || media_path;
    }

    await dronesService.updateGalleryItem(id, {
      model_key: modelKey,
      media_type,
      media_path,
      caption,
      sort_order,
      is_active,
    });

    return res.json({ message: "Item atualizado." });
  } catch (e) {
    console.error("[drones/admin] updateModelGalleryItem error:", e);
    if (file) safeUnlink(file);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao atualizar item.", 500, "SERVER_ERROR")
    );
  }
}

async function deleteModelGalleryItem(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const id = Number(req.params.id);
    if (!id) {
      throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });
    }

    // ✅ NÃO filtra no service (evita bug de filtro ignorado)
    const result = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const list = extractItems(result);

    const cur = list.find((x) => Number(x.id) === id);
    if (!cur) {
      throw new AppError("Item não encontrado.", 404, "NOT_FOUND", { id });
    }

    if (String(cur.model_key || "").trim().toLowerCase() !== modelKey) {
      throw new AppError("Item não pertence a este modelo.", 403, "FORBIDDEN", {
        id,
        modelKey,
        curModelKey: cur.model_key,
      });
    }

    await dronesService.deleteGalleryItem(id);
    return res.json({ message: "Item removido." });
  } catch (e) {
    console.error("[drones/admin] deleteModelGalleryItem error:", e);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao remover item.", 500, "SERVER_ERROR")
    );
  }
}

/**
 * =========================================================
 * LEGADO: GALERIA (alias compatível)
 * GET/POST/PUT/DELETE /api/admin/drones/galeria
 * =========================================================
 * Agora aceita:
 * - ?model_key=t25p (opcional no GET)
 * - body.model_key (opcional no POST/PUT)
 */

async function listGallery(req, res) {
  try {
    const modelKeyRaw = req.query.model_key ? String(req.query.model_key) : null;
    const model_key = modelKeyRaw ? parseModelKey(modelKeyRaw) : null;

    const result = await dronesService.listGalleryAdmin({
      page: req.query.page || 1,
      limit: req.query.limit || 1000,
      // ⚠️ aqui pode ser ignorado no service, mas mantém por compat
      model_key,
    });

    const items = extractItems(result);

    // se vier model_key, filtra aqui também (garante consistência)
    const out = model_key
      ? items.filter((x) => String(x.model_key || "").trim().toLowerCase() === model_key)
      : items;

    return res.json(out);
  } catch (e) {
    console.error("[drones/admin] listGallery error:", e);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao listar galeria.", 500, "SERVER_ERROR")
    );
  }
}

async function createGalleryItem(req, res) {
  const file = req.file;
  try {
    const modelKeyRaw = req.body?.model_key ? String(req.body.model_key) : null;
    const model_key = modelKeyRaw ? parseModelKey(modelKeyRaw) : null;

    if (!file) {
      throw new AppError("media é obrigatório.", 400, "VALIDATION_ERROR", { field: "media" });
    }

    const info = classify(file);
    if (!info) {
      safeUnlink(file);
      throw new AppError("Arquivo inválido. Aceito: jpg/png/webp/mp4.", 400, "VALIDATION_ERROR");
    }

    if (Number(file.size || 0) > info.max) {
      safeUnlink(file);
      throw new AppError(
        info.media_type === "VIDEO" ? "Vídeo > 30MB." : "Imagem > 5MB.",
        400,
        "VALIDATION_ERROR"
      );
    }

    const caption = dronesService.sanitizeText(req.body?.caption, 160) || null;
    const sort_order = Number(req.body?.sort_order) || 0;
    const is_active = normalizeBool(req.body?.is_active, true);

    const saved = await mediaService.persistMedia([file], { folder: "drones" });

    const id = await dronesService.createGalleryItem({
      model_key,
      media_type: info.media_type,
      media_path: saved?.[0]?.path,
      title: caption,
      sort_order,
      is_active,
    });

    return res.status(201).json({ message: "Item criado.", id });
  } catch (e) {
    console.error("[drones/admin] createGalleryItem error:", e);
    if (file) safeUnlink(file);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao criar item.", 500, "SERVER_ERROR")
    );
  }
}

async function updateGalleryItem(req, res) {
  const file = req.file;
  try {
    const id = Number(req.params.id);
    if (!id) {
      if (file) safeUnlink(file);
      throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });
    }

    const modelKeyRaw = req.body?.model_key ? String(req.body.model_key) : null;
    const model_key = modelKeyRaw ? parseModelKey(modelKeyRaw) : null;

    const caption = dronesService.sanitizeText(req.body?.caption, 160) || null;
    const sort_order = Number(req.body?.sort_order) || 0;
    const is_active = normalizeBool(req.body?.is_active, true);

    const result = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const list = extractItems(result);

    const cur = list.find((x) => Number(x.id) === id);
    if (!cur) {
      if (file) safeUnlink(file);
      throw new AppError("Item não encontrado.", 404, "NOT_FOUND", { id });
    }

    let media_type = cur.media_type;
    let media_path = cur.media_path;

    if (file) {
      const info = classify(file);
      if (!info) {
        safeUnlink(file);
        throw new AppError("Arquivo inválido.", 400, "VALIDATION_ERROR");
      }
      if (Number(file.size || 0) > info.max) {
        safeUnlink(file);
        throw new AppError(
          info.media_type === "VIDEO" ? "Vídeo > 30MB." : "Imagem > 5MB.",
          400,
          "VALIDATION_ERROR"
        );
      }

      const saved = await mediaService.persistMedia([file], { folder: "drones" });
      media_type = info.media_type;
      media_path = saved?.[0]?.path || media_path;
    }

    await dronesService.updateGalleryItem(id, {
      model_key: model_key !== null ? model_key : cur.model_key || null,
      media_type,
      media_path,
      title: caption,
      sort_order,
      is_active,
    });

    return res.json({ message: "Item atualizado." });
  } catch (e) {
    console.error("[drones/admin] updateGalleryItem error:", e);
    if (file) safeUnlink(file);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao atualizar item.", 500, "SERVER_ERROR")
    );
  }
}

async function deleteGalleryItem(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });
    }

    // Segurança opcional: valida model_key se vier na query
    const modelKeyRaw = req.query.model_key ? String(req.query.model_key) : null;
    const expectedModelKey = modelKeyRaw ? parseModelKey(modelKeyRaw) : null;

    const result = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const list = extractItems(result);

    const cur = list.find((x) => Number(x.id) === id);
    if (!cur) {
      throw new AppError("Item não encontrado.", 404, "NOT_FOUND", { id });
    }

    if (expectedModelKey) {
      if (String(cur.model_key || "").trim().toLowerCase() !== expectedModelKey) {
        throw new AppError("Item não pertence a este modelo.", 403, "FORBIDDEN", {
          id,
          modelKey: expectedModelKey,
          curModelKey: cur.model_key,
        });
      }
    }

    await dronesService.deleteGalleryItem(id);
    return res.json({ message: "Item removido." });
  } catch (e) {
    console.error("[drones/admin] deleteGalleryItem error:", e);
    return sendError(
      res,
      e instanceof AppError ? e : new AppError("Erro ao remover item.", 500, "SERVER_ERROR")
    );
  }
}


/* ===== Representantes (mantidos) ===== */
async function listRepresentatives(req, res) {
  try {
    const data = await dronesService.listRepresentativesAdmin({
      page: req.query.page,
      limit: req.query.limit,
      busca: req.query.busca,
      orderBy: req.query.orderBy,
      orderDir: req.query.orderDir,
    });
    return res.json(data);
  } catch (e) {
    console.error("[drones/admin] listRepresentatives error:", e);
    return sendError(res, new AppError("Erro ao listar representantes.", 500, "SERVER_ERROR"));
  }
}

function validateRepresentativePayload(body) {
  const name = dronesService.sanitizeText(body?.name, 120);
  const whatsapp = dronesService.normalizePhoneDigits(body?.whatsapp);
  const cnpj = dronesService.normalizePhoneDigits(body?.cnpj);

  const address_street = dronesService.sanitizeText(body?.address_street, 120);
  const address_number = dronesService.sanitizeText(body?.address_number, 30);

  if (!name) return "name é obrigatório.";
  if (!whatsapp) return "whatsapp é obrigatório.";
  if (!cnpj) return "cnpj é obrigatório.";
  if (!address_street) return "address_street é obrigatório.";
  if (!address_number) return "address_number é obrigatório.";

  return null;
}

async function createRepresentative(req, res) {
  try {
    const err = validateRepresentativePayload(req.body);
    if (err) throw new AppError(err, 400, "VALIDATION_ERROR");

    const id = await dronesService.createRepresentative(req.body);
    return res.status(201).json({ message: "Representante criado.", id });
  } catch (e) {
    console.error("[drones/admin] createRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao criar representante.", 500, "SERVER_ERROR"));
  }
}

async function updateRepresentative(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });

    const err = validateRepresentativePayload(req.body);
    if (err) throw new AppError(err, 400, "VALIDATION_ERROR");

    await dronesService.updateRepresentative(id, req.body);
    return res.json({ message: "Representante atualizado." });
  } catch (e) {
    console.error("[drones/admin] updateRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao atualizar representante.", 500, "SERVER_ERROR"));
  }
}

async function deleteRepresentative(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });

    await dronesService.deleteRepresentative(id);
    return res.json({ message: "Representante removido." });
  } catch (e) {
    console.error("[drones/admin] deleteRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao remover representante.", 500, "SERVER_ERROR"));
  }
}

/* ===== Comentários (moderação) ===== */
async function listComments(req, res) {
  try {
    const data = await dronesService.listCommentsAdmin({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
      model_key: req.query.model_key || null,
    });
    return res.json(data);
  } catch (e) {
    console.error("[drones/admin] listComments error:", e);
    return sendError(res, new AppError("Erro ao listar comentários.", 500, "SERVER_ERROR"));
  }
}

async function approveComment(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });

    await dronesService.setCommentStatus(id, "APROVADO");
    return res.json({ message: "Comentário aprovado." });
  } catch (e) {
    console.error("[drones/admin] approveComment error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao aprovar.", 500, "SERVER_ERROR"));
  }
}

async function rejectComment(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });

    await dronesService.setCommentStatus(id, "REPROVADO");
    return res.json({ message: "Comentário reprovado." });
  } catch (e) {
    console.error("[drones/admin] rejectComment error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao reprovar.", 500, "SERVER_ERROR"));
  }
}

async function deleteComment(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" });

    await dronesService.deleteComment(id);
    return res.json({ message: "Comentário removido." });
  } catch (e) {
    console.error("[drones/admin] deleteComment error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao remover comentário.", 500, "SERVER_ERROR"));
  }
}

module.exports = {
  // legado
  getPage,
  upsertPage,
  resetPageToDefault,

  // novo config landing
  getLandingConfig,
  upsertLandingConfig,

  // novo modelos
  listModels,
  createModel,
  deleteModel,
  getModelAggregate,
  upsertModelInfo,

  // novo galeria por modelo
  listModelGallery,
  createModelGalleryItem,
  updateModelGalleryItem,
  setModelMediaSelection,
  deleteModelGalleryItem,

  // legado galeria (alias)
  listGallery,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,

  // reps
  listRepresentatives,
  createRepresentative,
  updateRepresentative,
  deleteRepresentative,

  // comments
  listComments,
  approveComment,
  rejectComment,
  deleteComment,
};