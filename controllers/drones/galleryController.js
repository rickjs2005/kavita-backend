"use strict";

const dronesService = require("../../services/dronesService");
const mediaService = require("../../services/mediaService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { classify, safeUnlink, parseModelKey, ensureModelExists } = require("./dronesFormatters");
const { response } = require("../../lib");

// ---------------------------------------------------------------------------
// Private helper — file validation + persist (deduplicates 4 create/update handlers)
// ---------------------------------------------------------------------------

/**
 * Validates a multer file (type via classify, size limit) and persists it
 * to the drones media folder. Returns { media_type, media_path }.
 * On validation failure, cleans up the temp file and throws AppError.
 */
async function validateAndPersistFile(file) {
  const info = classify(file);
  if (!info) {
    safeUnlink(file);
    throw new AppError("Tipo de arquivo inválido. Use jpg/png/webp ou mp4.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  if (file.size > info.max) {
    safeUnlink(file);
    const mb = Math.round(info.max / 1024 / 1024);
    throw new AppError(`Arquivo excede ${mb}MB.`, ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const saved = await mediaService.persistMedia([file], { folder: "drones" });
  const media_path = saved?.[0]?.path;
  if (!media_path) {
    throw new AppError("Falha ao salvar arquivo.", ERROR_CODES.SERVER_ERROR, 500);
  }

  return { media_type: info.media_type, media_path };
}

// ========================
// Model-scoped gallery
// ========================

async function listModelGallery(req, res, next) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const result = await dronesService.listGalleryAdmin({ page, limit, model_key: modelKey });
    return response.ok(res, result);
  } catch (e) {
    console.error("[drones/admin] listModelGallery error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao listar galeria.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function createModelGalleryItem(req, res, next) {
  const file = req.file || null;

  try {
    const modelKey = parseModelKey(req.params.modelKey);
    await ensureModelExists(modelKey);

    if (!file) throw new AppError("Arquivo de mídia obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400);

    const { media_type, media_path } = await validateAndPersistFile(file);

    const sort_order = parseInt(req.body.sort_order, 10) || 0;
    const is_active = String(req.body.is_active || "1") === "0" ? 0 : 1;
    const title = String(req.body.title || "").trim() || null;

    const id = await dronesService.createGalleryItem({
      model_key: modelKey,
      media_type,
      media_path,
      title,
      sort_order,
      is_active,
    });

    return response.created(res, { id, media_type, media_path, model_key: modelKey }, "Item criado.");
  } catch (e) {
    console.error("[drones/admin] createModelGalleryItem error:", e);
    if (file) safeUnlink(file);
    return next(e instanceof AppError ? e : new AppError("Erro ao criar item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function updateModelGalleryItem(req, res, next) {
  const file = req.file || null;

  try {
    const modelKey = parseModelKey(req.params.modelKey);
    const itemId = parseInt(req.params.itemId, 10);

    if (!itemId) throw new AppError("ID do item inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    await ensureModelExists(modelKey);

    const patch = {};
    const body = req.body || {};

    if (file) {
      const { media_type, media_path } = await validateAndPersistFile(file);
      patch.media_path = media_path;
      patch.media_type = media_type;
    }

    if (Object.prototype.hasOwnProperty.call(body, "sort_order")) patch.sort_order = parseInt(body.sort_order, 10) || 0;
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) patch.is_active = String(body.is_active) === "0" ? 0 : 1;
    if (Object.prototype.hasOwnProperty.call(body, "title")) patch.title = String(body.title || "").trim() || null;

    await dronesService.updateGalleryItem(itemId, patch);

    return response.ok(res, { id: itemId }, "Item atualizado.");
  } catch (e) {
    console.error("[drones/admin] updateModelGalleryItem error:", e);
    if (file) safeUnlink(file);
    return next(e instanceof AppError ? e : new AppError("Erro ao atualizar item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteModelGalleryItem(req, res, next) {
  try {
    const modelKey = parseModelKey(req.params.modelKey);
    const itemId = parseInt(req.params.itemId, 10);

    if (!itemId) throw new AppError("ID do item inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    await ensureModelExists(modelKey);

    const affected = await dronesService.deleteGalleryItem(itemId);
    if (!affected) throw new AppError("Item não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, { id: itemId }, "Item removido.");
  } catch (e) {
    console.error("[drones/admin] deleteModelGalleryItem error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao remover item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// ========================
// Global gallery
// ========================

async function listGallery(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const model_key = req.query.model_key ? String(req.query.model_key).trim() : null;

    const result = await dronesService.listGalleryAdmin({ page, limit, model_key });
    return response.ok(res, result);
  } catch (e) {
    console.error("[drones/admin] listGallery error:", e);
    return next(new AppError("Erro ao listar galeria.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function createGalleryItem(req, res, next) {
  const file = req.file || null;

  try {
    if (!file) throw new AppError("Arquivo de mídia obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400);

    const { media_type, media_path } = await validateAndPersistFile(file);

    const body = req.body || {};
    const model_key = body.model_key ? String(body.model_key).trim() || null : null;
    const sort_order = parseInt(body.sort_order, 10) || 0;
    const is_active = String(body.is_active || "1") === "0" ? 0 : 1;
    const title = String(body.title || "").trim() || null;

    const id = await dronesService.createGalleryItem({
      model_key,
      media_type,
      media_path,
      title,
      sort_order,
      is_active,
    });

    return response.created(res, { id, media_type, media_path }, "Item criado.");
  } catch (e) {
    console.error("[drones/admin] createGalleryItem error:", e);
    if (file) safeUnlink(file);
    return next(e instanceof AppError ? e : new AppError("Erro ao criar item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function updateGalleryItem(req, res, next) {
  const file = req.file || null;

  try {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const patch = {};
    const body = req.body || {};

    if (file) {
      const { media_type, media_path } = await validateAndPersistFile(file);
      patch.media_path = media_path;
      patch.media_type = media_type;
    }

    if (Object.prototype.hasOwnProperty.call(body, "model_key")) {
      patch.model_key = body.model_key ? String(body.model_key).trim() || null : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "sort_order")) patch.sort_order = parseInt(body.sort_order, 10) || 0;
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) patch.is_active = String(body.is_active) === "0" ? 0 : 1;
    if (Object.prototype.hasOwnProperty.call(body, "title")) patch.title = String(body.title || "").trim() || null;

    const affected = await dronesService.updateGalleryItem(itemId, patch);
    if (!affected) throw new AppError("Item não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, { id: itemId }, "Item atualizado.");
  } catch (e) {
    console.error("[drones/admin] updateGalleryItem error:", e);
    if (file) safeUnlink(file);
    return next(e instanceof AppError ? e : new AppError("Erro ao atualizar item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteGalleryItem(req, res, next) {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.deleteGalleryItem(itemId);
    if (!affected) throw new AppError("Item não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, { id: itemId }, "Item removido.");
  } catch (e) {
    console.error("[drones/admin] deleteGalleryItem error:", e);
    return next(e instanceof AppError ? e : new AppError("Erro ao remover item.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = {
  listModelGallery,
  createModelGalleryItem,
  updateModelGalleryItem,
  deleteModelGalleryItem,
  listGallery,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
};
