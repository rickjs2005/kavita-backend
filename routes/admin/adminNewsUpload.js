// routes/admin/adminNewsUpload.js
//
// Upload de capa para posts de noticias.
// verifyAdmin + validateCSRF aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();
const mediaService = require("../../services/mediaService");
const ctrl = require("../../controllers/news/adminNewsUploadController");

const upload = mediaService.upload;

/**
 * @openapi
 * /api/admin/news/upload/cover:
 *   post:
 *     tags: [Admin - Posts]
 *     summary: Upload de capa para post
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Capa enviada }
 *       400: { description: Arquivo invalido }
 */
router.post("/cover", upload.single("file"), ctrl.uploadCover);

module.exports = router;
