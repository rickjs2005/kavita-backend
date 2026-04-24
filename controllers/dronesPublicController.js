// controllers/dronesPublicController.js
const dronesService = require("../services/dronesService");
const mediaService = require("../services/mediaService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const {
  classify,
  safeUnlink,
  parseJsonField,
  extractItems,
  parseModelKey,
  ensureModelExists,
  DEFAULT_DRONE_MODELS,
} = require("./drones/dronesFormatters");

/**
 * =========================================================
 * LEGADO: PAGE (mantém compatibilidade)
 * GET /api/public/drones/page
 * =========================================================
 */
async function getPage(req, res, next) {
  try {
    const row = await dronesService.getPageSettings();
    if (!row) return response.ok(res, null);

    return response.ok(res, {
      ...row,

      // LEGADO
      specs_items_json: parseJsonField(row.specs_items_json),
      features_items_json: parseJsonField(row.features_items_json),
      benefits_items_json: parseJsonField(row.benefits_items_json),
      sections_order_json: parseJsonField(row.sections_order_json),

      // NOVO
      models_json: parseJsonField(row.models_json),
    });
  } catch (e) {
    console.error("[drones/public] getPage error:", e);
    return next(new AppError("Erro ao carregar página de drones.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// ---------------------------------------------------------------------------
// Private helpers — extracted for readability and deduplication
// ---------------------------------------------------------------------------

/**
 * Builds the standardised landing shape used by getRoot and getModelAggregate.
 * Single source of truth for the fields exposed to the public frontend.
 */
function buildLandingShape(landing) {
  return {
    hero_title: landing.hero_title || null,
    hero_subtitle: landing.hero_subtitle || null,
    hero_video_path: landing.hero_video_path || null,
    hero_image_fallback_path: landing.hero_image_fallback_path || null,
    cta_title: landing.cta_title || null,
    cta_message_template: landing.cta_message_template || null,
    cta_button_label: landing.cta_button_label || null,
    sections_order_json: parseJsonField(landing.sections_order_json),
  };
}

/**
 * Enriches a list of drone models with media selection and resolved paths.
 * Handles both the new table (drone_model_media_selections) and the legacy
 * fallback (page_settings.models_json).
 */
async function enrichModelsWithMedia(items, modelsJson) {
  const keys = items
    .map((m) => String(m.key || "").trim().toLowerCase())
    .filter(Boolean);

  // 1) New source (drone_model_media_selections)
  let selectionsMap = {};
  try {
    selectionsMap = await dronesService.getSelectionsMapForModels(keys);
  } catch (_) {
    selectionsMap = {};
  }

  // 2) Merge with legacy fallback (page_settings.models_json)
  const withSelection = items.map((m) => {
    const key = String(m.key || "").trim().toLowerCase();
    const sel = selectionsMap?.[key] || null;
    const legacy = modelsJson?.[key] || {};

    return {
      ...m,
      current_hero_media_id: sel?.HERO ?? legacy.current_hero_media_id ?? null,
      current_card_media_id: sel?.CARD ?? legacy.current_card_media_id ?? null,
    };
  });

  // 3) Resolve media IDs → paths
  const wantedIds = withSelection
    .flatMap((m) => [m.current_card_media_id, m.current_hero_media_id])
    .filter((x) => Number.isFinite(Number(x)) && Number(x) > 0)
    .map((x) => Number(x));

  const mediaRows = await dronesService.getGalleryItemsByIds(wantedIds);
  const mediaById = mediaRows.reduce((acc, r) => {
    acc[String(r.id)] = r;
    return acc;
  }, {});

  return withSelection.map((m) => {
    const card = m.current_card_media_id ? mediaById[String(m.current_card_media_id)] : null;
    const hero = m.current_hero_media_id ? mediaById[String(m.current_hero_media_id)] : null;

    // Fallback automático: se o admin selecionou só a mídia de HERO
    // (destaque principal) e esqueceu de selecionar para o CARD, usa
    // a HERO no card também. Evita card ficar sem imagem mesmo quando
    // o admin já configurou destaque — bug comum na landing /drones.
    const cardResolved = card ?? hero ?? null;

    return {
      ...m,
      card_media_path: cardResolved?.media_path || null,
      card_media_type: cardResolved?.media_type || null,
      hero_media_path: hero?.media_path || null,
      hero_media_type: hero?.media_type || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * =========================================================
 * ✅ NOVO ROOT: agregados com ?model=xxx (dinâmico via DB)
 * GET /api/public/drones?model=t25p
 * =========================================================
 */
async function getRoot(req, res, next) {
  try {
    const modelKey = req.query.model ? parseModelKey(req.query.model) : null;

    const landing = await dronesService.getPageSettings();
    if (!landing) return response.ok(res, null);

    const models_json = parseJsonField(landing.models_json) || {};

    let modelRow = null;
    let modelData = null;

    if (modelKey) {
      modelRow = await ensureModelExists(modelKey);
      modelData = models_json?.[modelKey] || null;
    }

    const galleryResult = await dronesService.listGalleryPublic({ page: 1, limit: 1000, model_key: modelKey || null });
    const galleryItems = extractItems(galleryResult);
    const gallery = modelKey ? galleryItems.filter((g) => String(g.model_key || "") === modelKey) : galleryItems;

    const comments = await dronesService.listApprovedComments({
      page: req.query.page,
      limit: req.query.limit,
      model_key: modelKey || null,
    });

    return response.ok(res, {
      landing: buildLandingShape(landing),
      model: modelRow ? { key: modelRow.key, label: modelRow.label } : null,
      model_data: modelData,
      gallery,
      comments,
    });
  } catch (e) {
    console.error("[drones/public] getRoot error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao carregar dados públicos.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * =========================================================
 * ✅ NOVO: lista modelos (dinâmico via DB)
 * GET /api/public/drones/models
 * =========================================================
 */
async function listModels(req, res, next) {
  try {
    const items = await safeListModelsFromDb();

    const landing = await dronesService.getPageSettings();
    const models_json = parseJsonField(landing?.models_json) || {};

    const enriched = await enrichModelsWithMedia(items, models_json);

    return response.ok(res, { items: enriched });
  } catch (e) {
    console.error("[drones/public] listModels error:", e);
    return next(new AppError("Erro ao listar modelos.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * =========================================================
 * ✅ NOVO: agregado por modelo (dinâmico via DB)
 * GET /api/public/drones/models/:modelKey
 * =========================================================
 */
async function getModelAggregate(req, res, next) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    const modelRow = await ensureModelExists(modelKey);

    const landing = await dronesService.getPageSettings();
    if (!landing) return response.ok(res, null);

    const models_json = parseJsonField(landing.models_json) || {};
    const modelData = models_json?.[modelKey] || null;

    const galleryResult = await dronesService.listGalleryPublic({ page: 1, limit: 1000, model_key: modelKey });
    const gallery = extractItems(galleryResult).filter((g) => String(g.model_key || "") === modelKey);

    const comments = await dronesService.listApprovedComments({
      page: req.query.page,
      limit: req.query.limit,
      model_key: modelKey, // se o service suportar
    });

    return response.ok(res, {
      landing: buildLandingShape(landing),
      model: { key: modelRow.key, label: modelRow.label },
      model_data: modelData,
      gallery,
      comments,
    });
  } catch (e) {
    console.error("[drones/public] getModelAggregate error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao carregar modelo público.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * =========================================================
 * LEGADO: GALERIA (mantém compatibilidade)
 * GET /api/public/drones/galeria
 * =========================================================
 */
async function getGallery(req, res, next) {
  try {
    const rows = await dronesService.listGalleryPublic();
    return response.ok(res, rows);
  } catch (e) {
    console.error("[drones/public] getGallery error:", e);
    return next(new AppError("Erro ao carregar galeria.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function listRepresentatives(req, res, next) {
  try {
    const data = await dronesService.listRepresentativesPublic({
      page: req.query.page,
      limit: req.query.limit,
      busca: req.query.busca,
      orderBy: req.query.orderBy,
      orderDir: req.query.orderDir,
    });
    return response.ok(res, data);
  } catch (e) {
    console.error("[drones/public] listRepresentatives error:", e);
    return next(new AppError("Erro ao listar representantes.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function listApprovedComments(req, res, next) {
  try {
    const model_key = req.query.model ? parseModelKey(req.query.model) : null;

    // se pedir model, garante que existe (pra não ficar retornando vazio e confundir)
    if (model_key) await ensureModelExists(model_key);

    const data = await dronesService.listApprovedComments({
      page: req.query.page,
      limit: req.query.limit,
      model_key, // opcional (não quebra)
    });

    return response.ok(res, data);
  } catch (e) {
    console.error("[drones/public] listApprovedComments error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao listar comentários.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function createComment(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    // LOGIN obrigatório (verifyUser deve setar req.user)
    if (!req.user) {
      files.forEach(safeUnlink);
      throw new AppError("Usuário não autenticado.", ERROR_CODES.UNAUTHORIZED, 401);
    }

    // Nome vem do usuário logado
    const display_name = req.user.nome || req.user.name || req.user.email;
    if (!display_name) {
      files.forEach(safeUnlink);
      throw new AppError("Não foi possível identificar o nome do usuário logado.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    // model opcional (dinâmico)
    const model_key = req.body?.model_key ? parseModelKey(req.body.model_key) : null;
    if (model_key) await ensureModelExists(model_key);

    const comment_text = req.body?.comment_text;
    const textSan = dronesService.sanitizeText(comment_text, 1000);
    if (!textSan) {
      files.forEach(safeUnlink);
      throw new AppError("comment_text é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400, { field: "comment_text" });
    }

    // Valida arquivos antes de persistir
    if (files.length) {
      for (const f of files) {
        const info = classify(f);
        if (!info) {
          files.forEach(safeUnlink);
          throw new AppError("Arquivo inválido. Aceito: jpg/png/webp/mp4.", ERROR_CODES.VALIDATION_ERROR, 400);
        }
        if (Number(f.size || 0) > info.max) {
          files.forEach(safeUnlink);
          throw new AppError(info.media_type === "VIDEO" ? "Vídeo excede 30MB." : "Imagem excede 5MB.", ERROR_CODES.VALIDATION_ERROR, 400);
        }
      }
    }

    const mediaItems = [];

    if (files.length) {
      const saved = await mediaService.persistMedia(files, { folder: "drones" });
      const len = Math.min(files.length, Array.isArray(saved) ? saved.length : 0);

      for (let i = 0; i < len; i++) {
        const f = files[i];
        const s = saved[i];
        const info = classify(f);
        if (!info) continue;
        if (!s?.path) continue;

        mediaItems.push({
          media_type: info.media_type,
          media_path: s.path,
        });
      }
    }

    const id = await dronesService.createComment({
      model_key, // ✅ alinhado com admin
      display_name,
      comment_text: textSan,
      status: "APROVADO",
      approved_at: new Date(),
      ip: req.ip,
      user_agent: req.get("user-agent"),
      mediaItems,
    });

    return response.created(res, { id, status: "APROVADO" }, "Comentário publicado com sucesso.");
  } catch (e) {
    console.error("[drones/public] createComment error:", e);
    files.forEach(safeUnlink);
    return next(e instanceof AppError ? e : new AppError("Erro ao enviar comentário.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// ---------------------------------------------------------------------------
// Internal helper — not exported
// ---------------------------------------------------------------------------

async function safeListModelsFromDb() {
  try {
    const items = await dronesService.listDroneModels({ includeInactive: false });
    if (Array.isArray(items) && items.length) return items;
    return DEFAULT_DRONE_MODELS;
  } catch (e) {
    return DEFAULT_DRONE_MODELS;
  }
}

module.exports = {
  // legado
  getPage,
  getGallery,
  listRepresentatives,
  listApprovedComments,
  createComment,

  // novo
  getRoot,
  listModels,
  getModelAggregate,
};
