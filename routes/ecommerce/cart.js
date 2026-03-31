"use strict";

// routes/ecommerce/cart.js
//
// Rota magra: middleware + wiring de handlers.
// Lógica de negócio: services/cartService.js
// Handlers:         controllers/cartController.js
//
// Contrato de resposta atual: { success: true, ... } — divergente do padrão { ok: true }.
// NÃO alterar sem alinhar com o frontend. Ver CLAUDE.md § "Contratos divergentes".

const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const { CartItemBodySchema, CartItemParamSchema } = require("../../schemas/cartSchemas");
const ctrl = require("../../controllers/cartController");

router.use(authenticateToken);

/**
 * @swagger
 * tags:
 *   - name: Cart
 *     description: Operações do carrinho do usuário autenticado
 *
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 *   schemas:
 *     CartItem:
 *       type: object
 *       properties:
 *         item_id:
 *           type: integer
 *           example: 321
 *         produto_id:
 *           type: integer
 *           example: 105
 *         nome:
 *           type: string
 *           example: "Ração Premium"
 *         image:
 *           type: string
 *           nullable: true
 *           example: "https://cdn.site.com/img.png"
 *         valor_unitario:
 *           type: number
 *           example: 79.9
 *         quantidade:
 *           type: integer
 *           example: 2
 *         stock:
 *           type: integer
 *           description: Estoque atual do produto (products.quantity)
 *           example: 7
 *
 *     CartGetResponse:
 *       type: object
 *       properties:
 *         carrinho_id:
 *           type: integer
 *           nullable: true
 *           example: 12
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CartItem'
 *
 *     CartMutationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Produto adicionado ao carrinho"
 *         produto_id:
 *           type: integer
 *           example: 105
 *         quantidade:
 *           type: integer
 *           example: 3
 *         stock:
 *           type: integer
 *           example: 7
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: "SERVER_ERROR"
 *         message:
 *           type: string
 *           example: "Erro ao carregar carrinho."
 *
 *     StockLimitError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: "STOCK_LIMIT"
 *         message:
 *           type: string
 *           example: "Limite de estoque atingido."
 *         max:
 *           type: integer
 *           example: 7
 *         current:
 *           type: integer
 *           nullable: true
 *           example: 7
 *         requested:
 *           type: integer
 *           example: 8
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/cart:
 *   get:
 *     tags: [Cart]
 *     summary: Retorna o carrinho aberto do usuário logado (com estoque)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Carrinho atual
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartGetResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", ctrl.getCart);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Adiciona (ou incrementa) um produto no carrinho aberto (valida estoque)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [produto_id, quantidade]
 *             properties:
 *               produto_id:
 *                 type: integer
 *                 example: 105
 *               quantidade:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Item adicionado/incrementado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartMutationResponse'
 *       400:
 *         description: Validação
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Produto não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Limite de estoque atingido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StockLimitError'
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/items", validate(CartItemBodySchema), ctrl.addItem);

/**
 * @swagger
 * /api/cart/items:
 *   patch:
 *     tags: [Cart]
 *     summary: Atualiza a quantidade de um produto no carrinho (valida estoque). Use DELETE para remover.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [produto_id, quantidade]
 *             properties:
 *               produto_id:
 *                 type: integer
 *                 example: 105
 *               quantidade:
 *                 type: integer
 *                 example: 3
 *     responses:
 *       200:
 *         description: Quantidade atualizada/removida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartMutationResponse'
 *       400:
 *         description: Validação
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Produto não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Limite de estoque atingido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StockLimitError'
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch("/items", validate(CartItemBodySchema), ctrl.updateItem);

/**
 * @swagger
 * /api/cart/items/{produtoId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove um item específico do carrinho aberto
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: produtoId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 105
 *     responses:
 *       200:
 *         description: Item removido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Item removido do carrinho." }
 *       400:
 *         description: Validação
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/items/:produtoId", validate(CartItemParamSchema, "params"), ctrl.removeItem);

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Limpa o carrinho aberto do usuário e fecha o carrinho (status=fechado)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Carrinho limpo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Carrinho limpo." }
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/", ctrl.clearCart);

module.exports = router;
