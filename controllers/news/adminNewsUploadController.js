"use strict";

const { validateFileMagicBytes } = require("../../utils/fileValidation");
const mediaService = require("../../services/mediaService");
const safeUnlink = require("../../utils/safeUnlink");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");

/**
 * POST /api/admin/news/upload/cover
 *
 * Upload de capa para post de noticias.
 * Valida magic bytes (conteudo real, nao apenas MIME type).
 * Persiste via mediaService na pasta "news".
 */
const uploadCover = async (req, res, next) => {
  if (!req.file) {
    return next(
      new AppError("Nenhum arquivo enviado.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  const filePath = req.file.path;

  try {
    const { valid, detectedMime } = validateFileMagicBytes(filePath);

    if (!valid) {
      safeUnlink(filePath);
      return next(
        new AppError(
          "Arquivo invalido. Apenas imagens PNG, JPEG, WEBP ou GIF sao permitidas.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const [uploaded] = await mediaService.persistMedia([req.file], { folder: "news" });

    return response.ok(res, {
      url: uploaded.path,
      filename: req.file.filename,
      mimetype: detectedMime || req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    safeUnlink(filePath);
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao processar upload de capa.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { uploadCover };
