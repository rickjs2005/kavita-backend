// routes/admin/adminCarts.js
const express = require("express");
const router = express.Router();
const verifyAdmin = require("../../middleware/verifyAdmin");
const ctrl = require("../../controllers/cartsController");

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * tags:
 *   - name: AdminCarrinhos
 *     description: Gestão de carrinhos abandonados no painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AbandonedCartItem:
 *       type: object
 *       properties:
 *         produto_id: { type: integer }
 *         produto: { type: string }
 *         quantidade: { type: integer }
 *         preco_unitario: { type: number, format: float }
 *
 *     AbandonedCart:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         carrinho_id: { type: integer }
 *         usuario_id: { type: integer }
 *         usuario_nome: { type: string }
 *         usuario_email: { type: string }
 *         usuario_telefone: { type: string }
 *         itens:
 *           type: array
 *           items: { $ref: "#/components/schemas/AbandonedCartItem" }
 *         total_estimado: { type: number, format: float }
 *         criado_em: { type: string, format: date-time }
 *         atualizado_em: { type: string, format: date-time }
 *         recuperado: { type: boolean }
 *
 *   parameters:
 *     AbandonCartHoursQuery:
 *       in: query
 *       name: horas
 *       schema: { type: integer, minimum: 1, maximum: 720 }
 *       required: false
 *       description: Horas para considerar um carrinho como abandonado (padrão usa ABANDON_CART_HOURS env).
 */

// POST /api/admin/carrinhos/scan
router.post("/scan", verifyAdmin, ctrl.scan);

// GET /api/admin/carrinhos
router.get("/", verifyAdmin, ctrl.list);

// POST /api/admin/carrinhos/:id/notificar
router.post("/:id/notificar", verifyAdmin, ctrl.notify);

// GET /api/admin/carrinhos/:id/whatsapp-link
router.get("/:id/whatsapp-link", verifyAdmin, ctrl.whatsappLink);

module.exports = router;
