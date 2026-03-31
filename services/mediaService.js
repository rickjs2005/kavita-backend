"use strict";

/**
 * services/mediaService.js — Fachada pública do módulo de mídia.
 *
 * Responsabilidades internas delegadas a submódulos em services/media/:
 *   storageAdapter.js   — configuração de ambiente, utilitários, adapters disk/S3/GCS
 *   mediaPersistence.js — filtro MIME, instância multer, persistMedia
 *   mediaCleanup.js     — removeMedia, enqueueOrphanCleanup, fila de limpeza
 *
 * Interface pública (inalterada):
 *   upload              — instância multer pronta para uso em rotas
 *   persistMedia(files, options) → Promise<[{path, key}]>
 *   removeMedia(targets)         → Promise<void>
 *   enqueueOrphanCleanup(targets) → Promise<void>
 *   storageType         — string: "disk" | "s3" | "gcs"
 *   toPublicPath(filename) → string
 */

const { storageAdapter } = require("./media/storageAdapter");
const { upload, persistMedia } = require("./media/mediaPersistence");
const { removeMedia, enqueueOrphanCleanup } = require("./media/mediaCleanup");

module.exports = {
  upload,
  persistMedia,
  removeMedia,
  enqueueOrphanCleanup,
  storageType: storageAdapter.type,
  toPublicPath: (filename) =>
    typeof storageAdapter.toPublicPath === "function"
      ? storageAdapter.toPublicPath(filename)
      : filename,
};
