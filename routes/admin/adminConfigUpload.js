// routes/adminShopConfigUploadRoutes.js
// =============================================================================
// ARQUIVO LEGADO — NÃO USE COMO REFERÊNCIA DE IMPLEMENTAÇÃO
// =============================================================================
// Este arquivo usa o padrão antigo: SQL inline na rota, validação manual
// e res.json() direto, sem controller/service/repository separados.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - prefira migrar para o padrão canônico na mesma PR
//   - se a mudança for pontual, adicione ou atualize o teste correspondente
//   - nunca amplie o padrão legado com novas rotas neste arquivo
// =============================================================================
const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const db = require("../../config/pool");
const verifyAdmin = require("../../middleware/verifyAdmin");
const mediaService = require("../../services/mediaService");
const { validateFileMagicBytes } = require("../../utils/fileValidation");
const ERROR_CODES = require("../../constants/ErrorCodes");

const UPLOAD_ROOT = path.resolve(__dirname, "..", "uploads");

const upload = mediaService.upload;

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("⚠️ Não foi possível remover arquivo antigo:", e.message);
  }
}

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
      return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "Arquivo não enviado." });
    }

    const filePath = req.file.path;

    // Validate magic bytes (actual content, not just MIME type)
    const { valid } = validateFileMagicBytes(filePath, ["image/png", "image/jpeg", "image/webp"]);
    if (!valid) {
      safeUnlink(filePath);
      return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "Formato inválido. Envie PNG, JPG ou WEBP." });
    }

    const id = await ensureDefaultSettings();

    // pega logo antiga para remover do disco depois (evita lixo)
    const [oldRows] = await db.query("SELECT logo_url FROM shop_settings WHERE id = ?", [id]);
    const oldLogoUrl = oldRows?.[0]?.logo_url || null;

    // caminho público salvo no banco
    const [uploaded] = await mediaService.persistMedia([req.file], { folder: "logos" });
    const publicPath = uploaded.path;

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
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "Arquivo muito grande. Envie até 2MB." });
  }
  if (msg.includes("Formato inválido")) {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: msg });
  }
  return next(err);
});

module.exports = router;
