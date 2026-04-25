// routes/admin/adminProdutos.js
const express = require("express");
const router = express.Router();
const verifyAdmin = require("../../middleware/verifyAdmin");
const mediaService = require("../../services/mediaService");
const { validate } = require("../../middleware/validate");
const {
  CriarProdutoSchema,
  AtualizarProdutoSchema,
  ProdutoIdParamSchema,
  ProdutoStatusSchema,
} = require("../../schemas/requests");
const ctrl = require("../../controllers/produtosController");

const upload = mediaService.upload;

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */
/**
 * @openapi
 * tags:
 *   - name: Admin Produtos
 *     description: Gestão de produtos no painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 10 }
 *         name: { type: string, example: "Ração Premium 10kg" }
 *         description: { type: string, nullable: true }
 *         price: { type: number, example: 199.9 }
 *         quantity: { type: integer, example: 10 }
 *         category_id: { type: integer, example: 3 }
 *         image: { type: string, nullable: true }
 *         images:
 *           type: array
 *           items: { type: string }
 *         shipping_free: { type: integer, example: 1 }
 *         shipping_free_from_qty: { type: integer, nullable: true }
 */

// GET /api/admin/produtos
router.get("/", verifyAdmin, ctrl.list);

// GET /api/admin/produtos/estoque-baixo
// IMPORTANTE: precisa vir ANTES de /:id senão o regex de id captura
// "estoque-baixo" e tenta validar como inteiro (falha 400).
router.get("/estoque-baixo", verifyAdmin, ctrl.listLowStock);

// GET /api/admin/produtos/:id
router.get("/:id", verifyAdmin, validate(ProdutoIdParamSchema, "params"), ctrl.getById);

// POST /api/admin/produtos
router.post("/", verifyAdmin, upload.array("images"), validate(CriarProdutoSchema), ctrl.create);

// PUT /api/admin/produtos/:id
router.put(
  "/:id",
  verifyAdmin,
  validate(ProdutoIdParamSchema, "params"),
  upload.array("images"),
  validate(AtualizarProdutoSchema),
  ctrl.update
);

// PATCH /api/admin/produtos/:id/status
router.patch("/:id/status", verifyAdmin, validate(ProdutoIdParamSchema, "params"), validate(ProdutoStatusSchema), ctrl.updateStatus);

// DELETE /api/admin/produtos/:id
router.delete("/:id", verifyAdmin, validate(ProdutoIdParamSchema, "params"), ctrl.remove);

module.exports = router;
