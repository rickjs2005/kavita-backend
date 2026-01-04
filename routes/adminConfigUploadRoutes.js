// routes/adminShopConfigUploadRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();

const db = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * Diretório público de uploads
 * (você deve servir esse path no server.js: app.use("/uploads", express.static(...)))
 */
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const LOGO_DIR = path.join(UPLOAD_ROOT, "logos");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(LOGO_DIR);

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("⚠️ Não foi possível remover arquivo antigo:", e.message);
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, LOGO_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
    cb(null, `logo-${Date.now()}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Formato inválido. Envie PNG, JPG ou WEBP."), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

async function ensureDefaultSettings() {
  const [rows] = await db.query("SELECT id FROM shop_settings ORDER BY id ASC LIMIT 1");
  if (rows && rows.length) return rows[0].id;

  const [result] = await db.query(
    "INSERT INTO shop_settings (store_name, store_slug) VALUES (?, ?)",
    ["Kavita", "kavita-agro"]
  );
  return result.insertId;
}

/**
 * @openapi
 * /api/admin/shop-config/upload/logo:
 *   post:
 *     tags: [Admin, Configurações]
 *     summary: Upload da logo da loja
 *     description: Recebe um arquivo (PNG/JPG/WEBP até 2MB), salva em /uploads/logos e atualiza shop_settings.logo_url.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo enviada e salva com sucesso
 *       400:
 *         description: Arquivo inválido
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.post("/logo", verifyAdmin, upload.single("logo"), async (req, res, next) => {
  try {
    console.log("📦 Upload logo iniciado:", req.file?.originalname);

    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado." });
    }

    const id = await ensureDefaultSettings();

    // pega logo antiga para remover do disco depois (evita lixo)
    const [oldRows] = await db.query("SELECT logo_url FROM shop_settings WHERE id = ?", [id]);
    const oldLogoUrl = oldRows?.[0]?.logo_url || null;

    // caminho público salvo no banco
    const publicPath = `/uploads/logos/${req.file.filename}`;

    await db.query(
      "UPDATE shop_settings SET logo_url = ?, updated_at = NOW() WHERE id = ?",
      [publicPath, id]
    );

    // remove arquivo antigo (se existir e se for da pasta /uploads/logos)
    if (oldLogoUrl && typeof oldLogoUrl === "string" && oldLogoUrl.startsWith("/uploads/logos/")) {
      const oldFile = path.join(UPLOAD_ROOT, oldLogoUrl.replace("/uploads/", ""));
      safeUnlink(oldFile);
    }

    console.log("✅ Logo atualizada:", publicPath);

    return res.json({
      logo_url: publicPath,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Erro no upload de logo:", err);
    next(err);
  }
});

// handler de erro do multer (tamanho/formato)
router.use((err, req, res, next) => {
  const msg = err?.message || "Erro no upload.";
  if (msg.includes("File too large") || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Arquivo muito grande. Envie até 2MB." });
  }
  if (msg.includes("Formato inválido")) {
    return res.status(400).json({ error: msg });
  }
  return next(err);
});

module.exports = router;

