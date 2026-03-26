"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const {
  DEFAULT_DRONE_MODELS,
  parseJsonField,
  extractItems,
  parseModelKey,
  ensureModelExists,
  sendError,
} = require("./helpers");
const {
  createModelBodySchema,
  mediaSelectionBodySchema,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

async function listModels(req, res) {
  try {
    const includeInactive = String(req.query.includeInactive || "0") === "1";
    const items = await dronesService.listDroneModels({ includeInactive });
    return res.json({
      items: (Array.isArray(items) && items.length) ? items : DEFAULT_DRONE_MODELS,
    });
  } catch (e) {
    console.error("[drones/admin] listModels error:", e);
    return sendError(res, new AppError("Erro ao listar modelos.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function createModel(req, res) {
  try {
    const bodyResult = createModelBodySchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields: formatDronesErrors(bodyResult.error) });
    }

    const { key, label, sort_order, is_active } = bodyResult.data;

    try {
      await dronesService.createDroneModel({ key, label, sort_order, is_active });
    } catch (e) {
      if (e?.code === "DUPLICATE_MODEL_KEY" || e?.message === "DUPLICATE_MODEL_KEY") {
        throw new AppError("Já existe um modelo com esse key.", "CONFLICT", 409, { field: "key", key });
      }
      throw e;
    }

    return res.status(201).json({ message: "Modelo criado.", key });
  } catch (e) {
    console.error("[drones/admin] createModel error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao criar modelo.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteModel(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    const hard = String(req.query.hard || "0") === "1";

    await ensureModelExists(modelKey);

    if (hard) {
      await dronesService.hardDeleteDroneModel(modelKey);
      return res.json({ message: "Modelo removido definitivamente.", modelKey });
    }

    await dronesService.softDeleteDroneModel(modelKey);
    return res.json({ message: "Modelo desativado.", modelKey });
  } catch (e) {
    console.error("[drones/admin] deleteModel error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao excluir modelo.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function getModelAggregate(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    const modelRow = await ensureModelExists(modelKey);

    const row = await dronesService.getPageSettings();
    const models_json = parseJsonField(row?.models_json) || {};
    const modelData = models_json?.[modelKey] || null;

    const galleryResult = await dronesService.listGalleryAdmin({ page: 1, limit: 1000, model_key: modelKey });
    const gallery = extractItems(galleryResult).filter((g) => String(g.model_key || "") === modelKey);

    return res.json({
      model: { key: modelRow.key, label: modelRow.label },
      data: modelData,
      gallery,
    });
  } catch (e) {
    console.error("[drones/admin] getModelAggregate error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao carregar modelo.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function upsertModelInfo(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const body = req.body || {};
    const patch = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

    if (has("specs_title")) patch.specs_title = dronesService.sanitizeText(body.specs_title, 120) || null;
    if (has("specs_items_json")) patch.specs_items_json = Array.isArray(body.specs_items_json) ? body.specs_items_json : [];

    if (has("features_title")) patch.features_title = dronesService.sanitizeText(body.features_title, 120) || null;
    if (has("features_items_json")) patch.features_items_json = Array.isArray(body.features_items_json) ? body.features_items_json : [];

    if (has("benefits_title")) patch.benefits_title = dronesService.sanitizeText(body.benefits_title, 120) || null;
    if (has("benefits_items_json")) patch.benefits_items_json = Array.isArray(body.benefits_items_json) ? body.benefits_items_json : [];

    const badJson =
      (has("specs_items_json") && !Array.isArray(body.specs_items_json)) ||
      (has("features_items_json") && !Array.isArray(body.features_items_json)) ||
      (has("benefits_items_json") && !Array.isArray(body.benefits_items_json));

    if (badJson) {
      throw new AppError(
        "Envie specs_items_json/features_items_json/benefits_items_json como ARRAY (JSON), não string.",
        "VALIDATION_ERROR",
        400
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
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar modelo.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function setModelMediaSelection(req, res) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const bodyResult = mediaSelectionBodySchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields: formatDronesErrors(bodyResult.error) });
    }

    const { target: t, media_id: id } = bodyResult.data;

    const galleryResult = await dronesService.listGalleryAdmin({ page: 1, limit: 5000 });
    const items = extractItems(galleryResult);

    const found = items.find((x) => Number(x.id) === id);
    if (!found) throw new AppError("Mídia não encontrada.", ERROR_CODES.NOT_FOUND, 404, { id });

    if (String(found.model_key || "").trim().toLowerCase() !== modelKey) {
      throw new AppError("Mídia não pertence a este modelo.", ERROR_CODES.FORBIDDEN, 403, { id, modelKey });
    }

    await dronesService.upsertModelSelection(modelKey, t, id);

    const updated = await dronesService.getDroneModelByKey(modelKey);

    return res.json({ message: "Seleção salva.", modelKey, target: t, media_id: id, model: updated });
  } catch (e) {
    console.error("[drones/admin] setModelMediaSelection error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao salvar seleção.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = { listModels, createModel, deleteModel, getModelAggregate, upsertModelInfo, setModelMediaSelection };
