// routes/adminNewsUploadRoutes.js
const express = require("express");
const fs = require("fs");
const { validateFileMagicBytes } = require("../../utils/fileValidation");
const mediaService = require("../../services/mediaService");
const ERROR_CODES = require("../../constants/ErrorCodes");

const router = express.Router();

const upload = mediaService.upload;

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("⚠️ Não foi possível remover arquivo:", e.message);
  }
}

// OBS:
// Esta rota já está protegida por verifyAdmin em routes/index.js,
// pois adminNewsRoutes é montado em /api/admin/news com verifyAdmin.
// Então NÃO use authenticateToken aqui (evita conflito de token/cookie).

// POST /api/admin/news/upload/cover
router.post("/cover", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "Nenhum arquivo enviado." });
  }

  const filePath = req.file.path;

  // Validate file magic bytes (actual content, not just MIME type)
  const { valid, detectedMime } = validateFileMagicBytes(filePath);
  if (!valid) {
    safeUnlink(filePath);
    return res.status(400).json({
      ok: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Arquivo inválido. Apenas imagens PNG, JPEG, WEBP ou GIF são permitidas.",
    });
  }

  const [uploaded] = await mediaService.persistMedia([req.file], { folder: "news" });
  const publicUrl = uploaded.path;

  return res.json({
    ok: true,
    data: {
      url: publicUrl,
      filename: req.file.filename,
      mimetype: detectedMime || req.file.mimetype,
      size: req.file.size,
    },
  });
});

module.exports = router;
