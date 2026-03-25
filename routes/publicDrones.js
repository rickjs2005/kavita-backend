// routes/publicDrones.js
const express = require("express");
const router = express.Router();

const dronesPublicController = require("../controllers/dronesPublicController");
const dronesCommentThrottle = require("../middleware/dronesCommentThrottle");
const authenticateToken = require("../middleware/authenticateToken");

const mediaService = require("../services/mediaService");
const upload = mediaService.upload;

/**
 * @openapi
 * tags:
 *   - name: Public Drones
 *     description: Endpoints públicos do módulo Kavita Drones
 *
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status: { type: integer, example: 400 }
 *         code: { type: string, example: VALIDATION_ERROR }
 *         message: { type: string, example: Modelo inválido }
 *         details:
 *           type: object
 *           nullable: true
 *           example: { field: modelKey, reason: format, example: t25p }
 *
 *     DroneModel:
 *       type: object
 *       properties:
 *         key: { type: string, example: t25p }
 *         label: { type: string, example: DJI Agras T25P }
 */

/* =========================================================
 * ✅ NOVO ROOT (agregado)
 * GET /api/public/drones?model=t25p
 * ========================================================= */
/**
 * @openapi
 * /api/public/drones:
 *   get:
 *     tags: [Public Drones]
 *     summary: Retorna landing global + (opcional) agregado do modelo (modelos dinâmicos via DB)
 *     parameters:
 *       - in: query
 *         name: model
 *         required: false
 *         schema:
 *           type: string
 *           example: t25p
 *         description: modelKey dinâmico (regex ^[a-z0-9_]{2,20}$) e precisa existir no banco
 *     responses:
 *       200: { description: OK }
 *       400:
 *         description: Modelo inválido (formato)
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         description: Modelo não encontrado
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/", dronesPublicController.getRoot);

/* =========================================================
 * ✅ NOVO: modelos (dinâmico via DB)
 * GET /api/public/drones/models
 * GET /api/public/drones/models/:modelKey
 * ========================================================= */
/**
 * @openapi
 * /api/public/drones/models:
 *   get:
 *     tags: [Public Drones]
 *     summary: Lista modelos ativos (dinâmico via DB; fallback para 3 padrões se vazio)
 *     responses:
 *       200:
 *         description: Lista de modelos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/DroneModel' }
 */
router.get("/models", dronesPublicController.listModels);

/**
 * @openapi
 * /api/public/drones/models/{modelKey}:
 *   get:
 *     tags: [Public Drones]
 *     summary: Retorna agregado do modelo (landing global + data do modelo + galeria + comentários)
 *     parameters:
 *       - in: path
 *         name: modelKey
 *         required: true
 *         schema:
 *           type: string
 *           example: t25p
 *         description: modelKey dinâmico (regex ^[a-z0-9_]{2,20}$) e precisa existir no banco
 *     responses:
 *       200: { description: OK }
 *       400:
 *         description: Modelo inválido (formato)
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         description: Modelo não encontrado
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/models/:modelKey", dronesPublicController.getModelAggregate);

/* =========================================================
 * LEGADO: Página pública principal
 * GET /api/public/drones/page
 * ========================================================= */
router.get("/page", dronesPublicController.getPage);

/* =========================================================
 * LEGADO: Galeria pública
 * GET /api/public/drones/galeria
 * ========================================================= */
router.get("/galeria", dronesPublicController.getGallery);

/* =========================================================
 * LEGADO: Representantes
 * GET /api/public/drones/representantes
 * ========================================================= */
router.get("/representantes", dronesPublicController.listRepresentatives);

/* =========================================================
 * LEGADO: Comentários aprovados
 * GET /api/public/drones/comentarios
 * (aceita ?model=xxx dinâmico, sem quebrar)
 * ========================================================= */
router.get("/comentarios", dronesPublicController.listApprovedComments);

/* =========================================================
 * LEGADO: Criar comentário com mídia (LOGIN OBRIGATÓRIO)
 * POST /api/public/drones/comentarios
 * (aceita body.model_key dinâmico)
 * ========================================================= */
router.post(
  "/comentarios",
  authenticateToken,          // 🔒 login obrigatório
  dronesCommentThrottle,      // 🛡️ antispam
  upload.array("media", 6),   // 📎 até 6 mídias
  dronesPublicController.createComment
);

module.exports = router;
