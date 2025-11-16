// routes/checkoutRoutes.js
const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkoutController");

/**
 * @openapi
 * tags:
 *   name: Checkout
 *   description: Criação de pedidos no e-commerce
 *
 * components:
 *   schemas:
 *     CheckoutProduto:
 *       type: object
 *       required: [id, quantidade]
 *       properties:
 *         id: { type: integer, example: 1 }
 *         quantidade: { type: integer, example: 2 }
 *     Endereco:
 *       type: object
 *       required: [cep, rua, numero, bairro, cidade, estado]
 *       properties:
 *         cep: { type: string, example: "36940000" }
 *         rua: { type: string, example: "Rua das Flores" }
 *         numero: { type: string, example: "288" }
 *         bairro: { type: string, example: "Centro" }
 *         cidade: { type: string, example: "Manhuaçu" }
 *         estado: { type: string, example: "Minas Gerais" }
 *         complemento: { type: string, example: "perto da pracinha" }
 *     CheckoutBody:
 *       type: object
 *       required: [usuario_id, formaPagamento, endereco, produtos]
 *       properties:
 *         usuario_id: { type: integer, example: 1 }
 *         formaPagamento: { type: string, enum: [pix, boleto, mercadopago, prazo], example: pix }
 *         endereco:
 *           $ref: "#/components/schemas/Endereco"
 *         produtos:
 *           type: array
 *           items: { $ref: "#/components/schemas/CheckoutProduto" }
 *         total: { type: number, example: 55.0 }
 *     CheckoutResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         message: { type: string }
 *         pedido_id: { type: integer }
 */

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     summary: Cria um novo pedido
 *     tags: [Checkout]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CheckoutBody" }
 *     responses:
 *       201:
 *         description: Pedido criado
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/CheckoutResponse" }
 *       400:
 *         description: Erro de validação/estoque
 *       500:
 *         description: Erro interno
 */

// POST /api/checkout
router.post("/", checkoutController.create);

module.exports = router;
