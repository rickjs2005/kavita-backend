// controllers/dronesPublicController.js
const fs = require("fs");
const dronesService = require("../services/dronesService");
const mediaService = require("../services/mediaService");

/**
 * AppError fallback (compatível):
 * - Se seu projeto já tem AppError global, troque este require pelo caminho real e remova a classe abaixo.
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

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30MB
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

function classifyMedia(file) {
  const mime = String(file?.mimetype || "");
  if (ALLOWED_IMAGE.has(mime)) return { media_type: "IMAGE", max: MAX_IMAGE_BYTES };
  if (ALLOWED_VIDEO.has(mime)) return { media_type: "VIDEO", max: MAX_VIDEO_BYTES };
  return null;
}

function parseJson(v) {
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

/**
 * ✅ Alinhado com o Admin:
 * valida apenas formato, NÃO lista fixa.
 */
function parseModelKey(modelKey) {
  const key = String(modelKey || "").trim().toLowerCase();

  if (!key) {
    throw new AppError("Modelo inválido", 400, "VALIDATION_ERROR", {
      field: "modelKey",
      reason: "empty",
    });
  }

  // Mesmo padrão do admin: a-z, 0-9, _; 2-20 chars
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
 * ✅ Public exige que o modelo exista (e esteja ativo, se o service filtrar).
 * Caso o service retorne modelos inativos também, você pode reforçar is_active aqui.
 */
async function ensureModelExists(modelKey) {
  const existing = await dronesService.getDroneModelByKey(modelKey);
  if (!existing) {
    throw new AppError("Modelo não encontrado.", 404, "NOT_FOUND", { modelKey });
  }
  // Se sua tabela tiver is_active e o service não filtrar:
  // if (existing.is_active === 0 || existing.is_active === false) {
  //   throw new AppError("Modelo indisponível.", 404, "NOT_FOUND", { modelKey });
  // }
  return existing;
}

async function safeListModelsFromDb() {
  try {
    const items = await dronesService.listDroneModels({ includeInactive: false });
    if (Array.isArray(items) && items.length) return items;
    return DEFAULT_DRONE_MODELS;
  } catch (e) {
    return DEFAULT_DRONE_MODELS;
  }
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
 * LEGADO: PAGE (mantém compatibilidade)
 * GET /api/public/drones/page
 * =========================================================
 */
async function getPage(req, res) {
  try {
    const row = await dronesService.getPageSettings();
    if (!row) return res.json(null);

    return res.json({
      ...row,

      // LEGADO
      specs_items_json: parseJson(row.specs_items_json),
      features_items_json: parseJson(row.features_items_json),
      benefits_items_json: parseJson(row.benefits_items_json),
      sections_order_json: parseJson(row.sections_order_json),

      // NOVO
      models_json: parseJson(row.models_json),
    });
  } catch (e) {
    console.error("[drones/public] getPage error:", e);
    return sendError(res, new AppError("Erro ao carregar página de drones.", 500, "SERVER_ERROR"));
  }
}

/**
 * =========================================================
 * ✅ NOVO ROOT: agregados com ?model=xxx (dinâmico via DB)
 * GET /api/public/drones?model=t25p
 * =========================================================
 */
async function getRoot(req, res) {
  try {
    const modelKey = req.query.model ? parseModelKey(req.query.model) : null;

    const landing = await dronesService.getPageSettings();
    if (!landing) return res.json(null);

    const models_json = parseJson(landing.models_json) || {};

    let modelRow = null;
    let modelData = null;

    if (modelKey) {
      modelRow = await ensureModelExists(modelKey);
      modelData = models_json?.[modelKey] || null;
    }

    // Galeria
    const galleryResult = await dronesService.listGalleryPublic({ page: 1, limit: 1000, model_key: modelKey || null });
    const galleryItems = extractItems(galleryResult);
    const gallery = modelKey ? galleryItems.filter((g) => String(g.model_key || "") === modelKey) : galleryItems;

    // Comentários aprovados
    const comments = await dronesService.listApprovedComments({
      page: req.query.page,
      limit: req.query.limit,
      model_key: modelKey || null, // se o service suportar, filtra
    });

    return res.json({
      landing: {
        hero_title: landing.hero_title || null,
        hero_subtitle: landing.hero_subtitle || null,
        hero_video_path: landing.hero_video_path || null,
        hero_image_fallback_path: landing.hero_image_fallback_path || null,
        cta_title: landing.cta_title || null,
        cta_message_template: landing.cta_message_template || null,
        cta_button_label: landing.cta_button_label || null,
        sections_order_json: parseJson(landing.sections_order_json),
      },
      model: modelRow ? { key: modelRow.key, label: modelRow.label } : null,
      model_data: modelData,
      gallery,
      comments,
    });
  } catch (e) {
    console.error("[drones/public] getRoot error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao carregar dados públicos.", 500, "SERVER_ERROR"));
  }
}

/**
 * =========================================================
 * ✅ NOVO: lista modelos (dinâmico via DB)
 * GET /api/public/drones/models
 * =========================================================
 */
async function listModels(req, res) {
  try {
    const items = await safeListModelsFromDb();

    // 1) Fonte robusta (tabela drone_model_media_selections)
    //    - pega em lote pra evitar N+1
    const keys = items
      .map((m) => String(m.key || "").trim().toLowerCase())
      .filter(Boolean);

    let selectionsMap = {};
    try {
      selectionsMap = await dronesService.getSelectionsMapForModels(keys);
    } catch (err) {
      // se a migration ainda não existe em algum ambiente, não quebra o endpoint público
      selectionsMap = {};
    }

    // 2) Fallback legado (page_settings.models_json)
    const landing = await dronesService.getPageSettings();
    const models_json = parseJson(landing?.models_json) || {};

    const withSelection = items.map((m) => {
      const key = String(m.key || "").trim().toLowerCase();

      const sel = selectionsMap?.[key] || null;
      const heroFromTable = sel?.HERO ?? null;
      const cardFromTable = sel?.CARD ?? null;

      const legacy = models_json?.[key] || {};
      const heroLegacy = legacy.current_hero_media_id ?? null;
      const cardLegacy = legacy.current_card_media_id ?? null;

      return {
        ...m,
        current_hero_media_id: heroFromTable ?? heroLegacy,
        current_card_media_id: cardFromTable ?? cardLegacy,
      };
    });

    // ✅ NOVO: resolver ids -> media_path/media_type
    const wantedIds = withSelection
      .flatMap((m) => [m.current_card_media_id, m.current_hero_media_id])
      .filter((x) => Number.isFinite(Number(x)) && Number(x) > 0)
      .map((x) => Number(x));

    const mediaRows = await dronesService.getGalleryItemsByIds(wantedIds);

    // mapa por id
    const mediaById = mediaRows.reduce((acc, r) => {
      acc[String(r.id)] = r;
      return acc;
    }, {});

    const enriched = withSelection.map((m) => {
      const card = m.current_card_media_id ? mediaById[String(m.current_card_media_id)] : null;
      const hero = m.current_hero_media_id ? mediaById[String(m.current_hero_media_id)] : null;

      return {
        ...m,

        // ✅ O SEU FRONT JÁ SUPORTA ISSO:
        card_media_path: card?.media_path || null,
        card_media_type: card?.media_type || null,

        hero_media_path: hero?.media_path || null,
        hero_media_type: hero?.media_type || null,
      };
    });

        return res.json({ items: enriched });
      } catch (e) {
        console.error("[drones/public] listModels error:", e);
        return sendError(res, new AppError("Erro ao listar modelos.", 500, "SERVER_ERROR"));
      }
    }
  
      /**
       * =========================================================
       * ✅ NOVO: agregado por modelo (dinâmico via DB)
       * GET /api/public/drones/models/:modelKey
       * =========================================================
       */
      async function getModelAggregate(req, res) {
      try {
        const modelKey = parseModelKey(req.params.modelKey);
        const modelRow = await ensureModelExists(modelKey);

        const landing = await dronesService.getPageSettings();
        if (!landing) return res.json(null);

        const models_json = parseJson(landing.models_json) || {};
        const modelData = models_json?.[modelKey] || null;

        const galleryResult = await dronesService.listGalleryPublic({ page: 1, limit: 1000, model_key: modelKey });
        const gallery = extractItems(galleryResult).filter((g) => String(g.model_key || "") === modelKey);

        const comments = await dronesService.listApprovedComments({
          page: req.query.page,
          limit: req.query.limit,
          model_key: modelKey, // se o service suportar
        });

        return res.json({
          landing: {
            hero_title: landing.hero_title || null,
            hero_subtitle: landing.hero_subtitle || null,
            hero_video_path: landing.hero_video_path || null,
            hero_image_fallback_path: landing.hero_image_fallback_path || null,
            cta_title: landing.cta_title || null,
            cta_message_template: landing.cta_message_template || null,
            cta_button_label: landing.cta_button_label || null,
            sections_order_json: parseJson(landing.sections_order_json),
          },
          model: { key: modelRow.key, label: modelRow.label },
          model_data: modelData,
          gallery,
          comments,
        });
      } catch (e) {
        console.error("[drones/public] getModelAggregate error:", e);
        return sendError(res, e instanceof AppError ? e : new AppError("Erro ao carregar modelo público.", 500, "SERVER_ERROR"));
      }
    }

    /**
     * =========================================================
     * LEGADO: GALERIA (mantém compatibilidade)
     * GET /api/public/drones/galeria
     * =========================================================
     */
    async function getGallery(req, res) {
      try {
        const rows = await dronesService.listGalleryPublic();
        return res.json(rows);
      } catch (e) {
        console.error("[drones/public] getGallery error:", e);
        return sendError(res, new AppError("Erro ao carregar galeria.", 500, "SERVER_ERROR"));
      }
    }

    async function listRepresentatives(req, res) {
      try {
        const data = await dronesService.listRepresentativesPublic({
          page: req.query.page,
          limit: req.query.limit,
          busca: req.query.busca,
          orderBy: req.query.orderBy,
          orderDir: req.query.orderDir,
        });
        return res.json(data);
      } catch (e) {
        console.error("[drones/public] listRepresentatives error:", e);
        return sendError(res, new AppError("Erro ao listar representantes.", 500, "SERVER_ERROR"));
      }
    }
  
    async function listApprovedComments(req, res) {
      try {
        const model_key = req.query.model ? parseModelKey(req.query.model) : null;

        // se pedir model, garante que existe (pra não ficar retornando vazio e confundir)
        if (model_key) await ensureModelExists(model_key);

        const data = await dronesService.listApprovedComments({
          page: req.query.page,
          limit: req.query.limit,
          model_key, // opcional (não quebra)
        });

        return res.json(data);
      } catch (e) {
        console.error("[drones/public] listApprovedComments error:", e);
        return sendError(res, e instanceof AppError ? e : new AppError("Erro ao listar comentários.", 500, "SERVER_ERROR"));
      }
    }

    async function createComment(req, res) {
      const files = Array.isArray(req.files) ? req.files : [];
  
      try {
        // LOGIN obrigatório (verifyUser deve setar req.user)
        if (!req.user) {
          files.forEach(safeUnlink);
          throw new AppError("Usuário não autenticado.", 401, "UNAUTHORIZED");
        }
  
        // Nome vem do usuário logado
        const display_name = req.user.nome || req.user.name || req.user.email;
        if (!display_name) {
          files.forEach(safeUnlink);
          throw new AppError("Não foi possível identificar o nome do usuário logado.", 400, "VALIDATION_ERROR");
        }
  
        // model opcional (dinâmico)
        const model_key = req.body?.model_key ? parseModelKey(req.body.model_key) : null;
        if (model_key) await ensureModelExists(model_key);
  
        const comment_text = req.body?.comment_text;
        const textSan = dronesService.sanitizeText(comment_text, 1000);
        if (!textSan) {
          files.forEach(safeUnlink);
          throw new AppError("comment_text é obrigatório.", 400, "VALIDATION_ERROR", { field: "comment_text" });
        }
  
        // Valida arquivos antes de persistir
        if (files.length) {
          for (const f of files) {
            const info = classifyMedia(f);
            if (!info) {
              files.forEach(safeUnlink);
              throw new AppError("Arquivo inválido. Aceito: jpg/png/webp/mp4.", 400, "VALIDATION_ERROR");
            }
            if (Number(f.size || 0) > info.max) {
              files.forEach(safeUnlink);
              throw new AppError(info.media_type === "VIDEO" ? "Vídeo excede 30MB." : "Imagem excede 5MB.", 400, "VALIDATION_ERROR");
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
            const info = classifyMedia(f);
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
  
        return res.status(201).json({
          message: "Comentário publicado com sucesso.",
          id,
          status: "APROVADO",
        });
      } catch (e) {
        console.error("[drones/public] createComment error:", e);
        files.forEach(safeUnlink);
        return sendError(res, e instanceof AppError ? e : new AppError("Erro ao enviar comentário.", 500, "SERVER_ERROR"));
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