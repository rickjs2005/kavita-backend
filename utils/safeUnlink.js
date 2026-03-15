"use strict";
// utils/safeUnlink.js
// Remove um arquivo do disco ignorando erros não fatais.
//
// Substitui definições duplicadas em:
//   - routes/adminColaboradores.js
//   - routes/adminConfigUploadRoutes.js
//
// USO:
//   const safeUnlink = require("../utils/safeUnlink");
//   safeUnlink(req.file?.path);

const fs     = require("fs");
const logger = require("../lib/logger");

/**
 * Remove um arquivo do disco sem lançar exceção.
 * Loga um warn se a remoção falhar por motivo inesperado.
 *
 * @param {string|null|undefined} filePath  caminho absoluto no disco
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.warn(
      { filePath, err: err.message },
      "safeUnlink: não foi possível remover arquivo"
    );
  }
}

module.exports = safeUnlink;
