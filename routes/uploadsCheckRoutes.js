// routes/uploadsCheckRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const { validateFileMagicBytes } = require("../utils/fileValidation");

const router = express.Router();

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

/**
 * GET /api/uploads/check/*
 * Verifica se um arquivo existe em disk dentro de /uploads.
 * Exemplo: GET /api/uploads/check/products/foto.webp
 * Retorna caminho completo, tamanho e MIME type detectado por magic bytes.
 */
router.get("/check/*", (req, res) => {
  const rawParam = req.params[0] || "";

  if (!rawParam) {
    return res.status(400).json({ ok: false, error: "Filename não informado." });
  }

  // Security: prevent path traversal
  const resolved = path.resolve(UPLOADS_DIR, rawParam);
  const rel = path.relative(UPLOADS_DIR, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return res.status(400).json({ ok: false, error: "Caminho inválido." });
  }

  const exists = fs.existsSync(resolved);
  if (!exists) {
    return res.status(404).json({
      ok: false,
      exists: false,
      filename: rawParam,
    });
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return res.status(400).json({ ok: false, error: "Caminho não é um arquivo." });
  }

  const { detectedMime } = validateFileMagicBytes(resolved);

  return res.json({
    ok: true,
    exists: true,
    filename: rawParam,
    size: stat.size,
    mtime: stat.mtime,
    mimetype: detectedMime,
  });
});

module.exports = router;
