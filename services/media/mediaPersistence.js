"use strict";

/**
 * services/media/mediaPersistence.js
 *
 * Filtro de MIME type, instância multer e função persistMedia.
 * Depende apenas de storageAdapter (sem dependências circulares).
 */

const multer = require("multer");
const { storageAdapter } = require("./storageAdapter");

// ── MIME allowlists ────────────────────────────────────────────────────────

// image/* intencional NÃO é usado para evitar image/svg+xml (XSS) e similares.
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

// ── Filtro de upload ───────────────────────────────────────────────────────

const imageFilter = (_req, file, cb) => {
  const mime = String(file.mimetype || "");

  if (file.fieldname === "heroVideo") {
    if (!ALLOWED_VIDEO_MIMES.has(mime)) {
      return cb(
        Object.assign(new Error("heroVideo inválido. Use mp4, webm ou ogg."), { status: 400 })
      );
    }
    return cb(null, true);
  }

  if (file.fieldname === "media") {
    if (!ALLOWED_IMAGE_MIMES.has(mime) && !ALLOWED_VIDEO_MIMES.has(mime)) {
      return cb(
        Object.assign(
          new Error("Arquivo inválido. Envie imagem (jpeg/png/webp/gif) ou vídeo (mp4/webm/ogg)."),
          { status: 400 }
        )
      );
    }
    return cb(null, true);
  }

  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return cb(
      Object.assign(
        new Error("Tipo de arquivo não permitido. Use: jpeg, png, webp ou gif."),
        { status: 400 }
      )
    );
  }

  return cb(null, true);
};

// ── Instância multer ───────────────────────────────────────────────────────

const upload = multer({
  storage: storageAdapter.storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB (hero videos can be large)
    files: 10,
  },
});

// ── persistMedia ───────────────────────────────────────────────────────────

async function persistMedia(files = [], options = {}) {
  if (!files.length || typeof storageAdapter.persist !== "function") {
    return [];
  }
  return storageAdapter.persist(files, options);
}

module.exports = { upload, persistMedia };
