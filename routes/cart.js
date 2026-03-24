"use strict";

const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authenticateToken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { validateQuantity } = require("../middleware/cartValidation");
const cartService = require("../services/cartService");

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
// Internal helpers
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

function sendStockLimit(res, err) {
  return res.status(409).json({
    code: "STOCK_LIMIT",
    message: err.message,
    max: err.meta?.max ?? null,
    current: err.meta?.current ?? null,
    requested: err.meta?.requested ?? null,
  });
}

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
router.get("/", async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  try {
    const result = await cartService.getCart(userId);
    return res.json(result);
  } catch (e) {
    console.error("GET /api/cart erro:", e);
    return next(
      new AppError("Erro ao carregar carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

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
router.post("/items", async (req, res, next) => {
  const { produto_id, quantidade } = req.body || {};
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  const produtoIdNum = toInt(produto_id);

  if (!Number.isFinite(produtoIdNum) || produtoIdNum <= 0) {
    return next(
      new AppError(
        "produto_id é obrigatório e deve ser válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  const qtdErr = validateQuantity(quantidade);
  if (qtdErr) return next(qtdErr);

  try {
    const result = await cartService.addItem(userId, { produto_id, quantidade });
    return res.status(200).json({
      success: true,
      message: "Produto adicionado ao carrinho",
      produto_id: result.produto_id,
      quantidade: result.quantidade,
      stock: result.stock,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "STOCK_LIMIT") return sendStockLimit(res, e);
    console.error("POST /api/cart/items erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError(
            "Erro ao adicionar item ao carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
});

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
router.patch("/items", async (req, res, next) => {
  const { produto_id, quantidade } = req.body || {};
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  const produtoIdNum = toInt(produto_id);

  if (!Number.isFinite(produtoIdNum) || produtoIdNum <= 0) {
    return next(
      new AppError(
        "produto_id é obrigatório e deve ser válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  const qtdErr = validateQuantity(quantidade);
  if (qtdErr) return next(qtdErr);

  try {
    const result = await cartService.updateItem(userId, { produto_id, quantidade });
    return res.status(200).json({
      success: true,
      message: result.emptyCart ? "Carrinho já vazio." : "Quantidade atualizada.",
      produto_id: result.produto_id,
      quantidade: result.quantidade,
      stock: result.stock,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "STOCK_LIMIT") return sendStockLimit(res, e);
    console.error("PATCH /api/cart/items erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError(
            "Erro ao atualizar item do carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
});

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
router.delete("/items/:produtoId", async (req, res, next) => {
  const userId = req.user?.id;
  const produtoId = toInt(req.params.produtoId);

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return next(
      new AppError("produtoId inválido.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  try {
    const result = await cartService.removeItem(userId, produtoId);
    return res.json({
      success: true,
      message: result.removed ? "Item removido do carrinho." : "Carrinho já vazio.",
    });
  } catch (e) {
    console.error("DELETE /api/cart/items/:produtoId erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError(
            "Erro ao remover item do carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
});

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
router.delete("/", async (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  try {
    const result = await cartService.clearCart(userId);
    return res.json({
      success: true,
      message: result.cleared ? "Carrinho limpo." : "Carrinho já estava vazio.",
    });
  } catch (e) {
    console.error("DELETE /api/cart erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao limpar carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

module.exports = router;
