"use strict";
// config/media.js
// Diretório raiz de uploads — fonte única de verdade para todo o projeto.
//
// Substitui definições duplicadas em:
//   - server.js                   (const UPLOADS_DIR = path.resolve(...))
//   - routes/uploadsCheckRoutes.js (const UPLOADS_DIR = path.resolve(...))
//   - routes/adminConfigUploadRoutes.js (const UPLOAD_ROOT = path.resolve(...))
//
// USO:
//   const { UPLOADS_DIR } = require("../config/media");

const path = require("path");

/**
 * Caminho absoluto para o diretório de uploads.
 * Sobrescrevível via MEDIA_UPLOAD_DIR (útil em testes ou containers).
 */
const UPLOADS_DIR = path.resolve(
  process.env.MEDIA_UPLOAD_DIR || path.join(__dirname, "..", "uploads")
);

module.exports = { UPLOADS_DIR };
