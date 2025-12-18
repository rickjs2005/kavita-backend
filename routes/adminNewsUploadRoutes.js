// routes/adminNewsUploadRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "news");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : ".jpg";
    const name = `news_${Date.now()}_${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return cb(new Error("Arquivo inválido. Envie uma imagem."), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// OBS:
// Esta rota já está protegida por verifyAdmin em routes/index.js,
// pois adminNewsRoutes é montado em /api/admin/news com verifyAdmin.
// Então NÃO use authenticateToken aqui (evita conflito de token/cookie).

// POST /api/admin/news/upload/cover
router.post("/cover", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
  }

  const base = `${req.protocol}://${req.get("host")}`;
  const publicUrl = `${base}/uploads/news/${req.file.filename}`;

  return res.json({
    ok: true,
    data: {
      url: publicUrl,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
    },
  });
});

module.exports = router;
