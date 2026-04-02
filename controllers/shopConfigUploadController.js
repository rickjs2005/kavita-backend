"use strict";
// controllers/shopConfigUploadController.js

const fs = require("fs");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { validateFileMagicBytes } = require("../utils/fileValidation");
const { response } = require("../lib");
const service = require("../services/shopConfigUploadService");

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* ignorar */ }
}

const uploadLogo = async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Arquivo não enviado.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  const { valid } = validateFileMagicBytes(req.file.path, ["image/png", "image/jpeg", "image/webp"]);
  if (!valid) {
    safeUnlink(req.file.path);
    return next(new AppError("Formato inválido. Envie PNG, JPG ou WEBP.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const result = await service.uploadLogo(req.file);
    response.ok(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadLogo };
