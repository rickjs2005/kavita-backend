"use strict";

const dronesService = require("../../services/dronesService");
const mediaService = require("../../services/mediaService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const { classify, safeUnlink } = require("./dronesFormatters");
const {
  createCaseSchema,
  updateCaseSchema,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

const IMAGE_FIELDS = ["cover_image", "before_image", "after_image"];

/**
 * Persiste 0..N imagens vindas em req.files (multer .fields). Retorna
 * map { cover_image_url, before_image_url, after_image_url } com paths
 * dos arquivos persistidos. Faz cleanup de arquivos inválidos antes de
 * lançar o erro.
 */
async function persistCaseImages(req) {
  const result = {};
  const fileLog = []; // controla cleanup em caso de erro

  for (const field of IMAGE_FIELDS) {
    const arr = req.files?.[field];
    if (!arr || !arr.length) continue;
    const file = arr[0];
    fileLog.push(file);

    const info = classify(file);
    if (!info || info.media_type !== "IMAGE") {
      fileLog.forEach(safeUnlink);
      throw new AppError(
        "Imagem inválida (use jpg/png/webp).",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (file.size > info.max) {
      fileLog.forEach(safeUnlink);
      throw new AppError(
        `Imagem ${field} excede o limite.`,
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const saved = await mediaService.persistMedia([file], { folder: "drones" });
    const path = saved?.[0]?.path;
    if (!path) {
      fileLog.forEach(safeUnlink);
      throw new AppError("Falha ao salvar imagem.", ERROR_CODES.SERVER_ERROR, 500);
    }

    // Mapeia field para coluna no banco
    if (field === "cover_image") result.cover_image_url = path;
    else if (field === "before_image") result.before_image_url = path;
    else if (field === "after_image") result.after_image_url = path;
  }

  return result;
}

async function listCasesAdmin(req, res, next) {
  try {
    const model_key = req.query.model_key
      ? String(req.query.model_key).trim()
      : undefined;
    const items = await dronesService.listCasesAdmin({ model_key });
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/admin] listCasesAdmin error:", e);
    return next(
      new AppError("Erro ao listar cases.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function getCase(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    const row = await dronesService.getCaseById(id);
    if (!row) throw new AppError("Case não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    return response.ok(res, row);
  } catch (e) {
    console.error("[drones/admin] getCase error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao buscar case.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function createCase(req, res, next) {
  try {
    const bodyResult = createCaseSchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }
    const images = await persistCaseImages(req);
    const id = await dronesService.createCase({ ...bodyResult.data, ...images });
    return response.created(res, { id }, "Case criado.");
  } catch (e) {
    console.error("[drones/admin] createCase error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao criar case.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function updateCase(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const bodyResult = updateCaseSchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }

    const newImages = await persistCaseImages(req);

    // Se admin enviou nova imagem, remove a antiga (best-effort).
    if (Object.keys(newImages).length) {
      const existing = await dronesService.getCaseById(id);
      const oldPaths = [];
      if (newImages.cover_image_url && existing?.cover_image_url)
        oldPaths.push(existing.cover_image_url);
      if (newImages.before_image_url && existing?.before_image_url)
        oldPaths.push(existing.before_image_url);
      if (newImages.after_image_url && existing?.after_image_url)
        oldPaths.push(existing.after_image_url);
      if (oldPaths.length) {
        try {
          await mediaService.removeMedia(oldPaths);
        } catch (err) {
          console.warn("[drones/cases] cleanup warning:", err?.message || err);
        }
      }
    }

    const affected = await dronesService.updateCase(id, {
      ...bodyResult.data,
      ...newImages,
    });
    if (!affected) throw new AppError("Case não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, { id }, "Case atualizado.");
  } catch (e) {
    console.error("[drones/admin] updateCase error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao atualizar case.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function deleteCase(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.deleteCase(id);
    if (!affected) throw new AppError("Case não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, { id }, "Case removido.");
  } catch (e) {
    console.error("[drones/admin] deleteCase error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao remover case.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function listCasesPublic(req, res, next) {
  try {
    const model_key = req.query.model
      ? String(req.query.model).trim()
      : undefined;
    const items = await dronesService.listCasesPublic({ model_key });
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/public] listCasesPublic error:", e);
    return next(
      new AppError("Erro ao carregar cases.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = {
  listCasesAdmin,
  getCase,
  createCase,
  updateCase,
  deleteCase,
  listCasesPublic,
};
