const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authenticateToken = require("../middleware/authenticateToken");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

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

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

function makeStockLimitError({ max, requested, current }) {
  // AppError(message, code, status)
  const err = new AppError("Limite de estoque atingido.", "STOCK_LIMIT", 409);
  err.meta = { max, requested, current };
  return err;
}

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

  try {
    if (!userId) {
      return next(
        new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }

    const [[carrinho]] = await pool.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) return res.json({ carrinho_id: null, items: [] });

    const [itens] = await pool.query(
      `SELECT 
          ci.id AS item_id,
          ci.produto_id,
          ci.quantidade,
          ci.valor_unitario,
          p.name  AS nome,
          p.image AS image,
          p.quantity AS stock
       FROM carrinho_itens ci
       JOIN products p ON p.id = ci.produto_id
       WHERE ci.carrinho_id = ?`,
      [carrinho.id]
    );

    return res.json({ carrinho_id: carrinho.id, items: itens });
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

  const produtoIdNum = toInt(produto_id);
  const qtdNum = toInt(quantidade);

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  if (!Number.isFinite(produtoIdNum) || produtoIdNum <= 0) {
    return next(
      new AppError(
        "produto_id é obrigatório e deve ser válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  if (!Number.isFinite(qtdNum) || qtdNum <= 0) {
    return next(
      new AppError(
        "quantidade deve ser um número maior que zero.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) carrinho aberto (cria se não existir)
    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    let carrinhoId = carrinho?.id;

    if (!carrinhoId) {
      const [newCart] = await conn.query(
        "INSERT INTO carrinhos (usuario_id) VALUES (?)",
        [userId]
      );
      carrinhoId = newCart.insertId;
    }

    // 2) lock produto (estoque) + preço
    const [[produto]] = await conn.query(
      "SELECT id, price, quantity FROM products WHERE id = ? FOR UPDATE",
      [produtoIdNum]
    );

    if (!produto) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const stock = Number(produto.quantity ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      throw makeStockLimitError({ max: 0, requested: qtdNum, current: 0 });
    }

    // 3) lock item existente no carrinho (se houver)
    const [[existente]] = await conn.query(
      "SELECT id, quantidade FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ? FOR UPDATE",
      [carrinhoId, produtoIdNum]
    );

    const currentQty = Number(existente?.quantidade ?? 0);
    const desired = currentQty + qtdNum;

    if (desired > stock) {
      throw makeStockLimitError({
        max: stock,
        requested: desired,
        current: currentQty,
      });
    }

    // 4) update/insert
    if (existente) {
      await conn.query("UPDATE carrinho_itens SET quantidade = ? WHERE id = ?", [
        desired,
        existente.id,
      ]);
    } else {
      await conn.query(
        `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [carrinhoId, produtoIdNum, desired, produto.price]
      );
    }

    await conn.commit();
    return res.status(200).json({
      success: true,
      message: "Produto adicionado ao carrinho",
      produto_id: produtoIdNum,
      quantidade: desired,
      stock,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("POST /api/cart/items rollback erro:", rb);
    }

    console.error("POST /api/cart/items erro:", e);

    // se for STOCK_LIMIT, envia payload compatível com Swagger
    if (e instanceof AppError && e.code === "STOCK_LIMIT") {
      return res.status(409).json({
        code: "STOCK_LIMIT",
        message: e.message,
        max: e.meta?.max ?? null,
        current: e.meta?.current ?? null,
        requested: e.meta?.requested ?? null,
      });
    }

    return next(
      e instanceof AppError
        ? e
        : new AppError(
            "Erro ao adicionar item ao carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
  }
});

/**
 * @swagger
 * /api/cart/items:
 *   patch:
 *     tags: [Cart]
 *     summary: Atualiza a quantidade de um produto no carrinho (valida estoque). Se quantidade <= 0, remove.
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

  const produtoIdNum = toInt(produto_id);
  const q = toInt(quantidade || 0);

  if (!userId) {
    return next(
      new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  if (!Number.isFinite(produtoIdNum) || produtoIdNum <= 0) {
    return next(
      new AppError(
        "produto_id é obrigatório e deve ser válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  if (!Number.isFinite(q)) {
    return next(
      new AppError("quantidade inválida.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return res.status(200).json({
        success: true,
        message: "Carrinho já vazio.",
        produto_id: produtoIdNum,
        quantidade: 0,
        stock: 0,
      });
    }

    // Remoção não precisa validar estoque
    if (q <= 0) {
      await conn.query(
        "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
        [carrinho.id, produtoIdNum]
      );

      await conn.commit();
      return res.status(200).json({
        success: true,
        message: "Item removido.",
        produto_id: produtoIdNum,
        quantidade: 0,
        stock: 0,
      });
    }

    // lock produto (estoque)
    const [[produto]] = await conn.query(
      "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
      [produtoIdNum]
    );

    if (!produto) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const stock = Number(produto.quantity ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      throw makeStockLimitError({ max: 0, requested: q, current: 0 });
    }

    if (q > stock) {
      throw makeStockLimitError({ max: stock, requested: q, current: null });
    }

    await conn.query(
      "UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?",
      [q, carrinho.id, produtoIdNum]
    );

    await conn.commit();
    return res.status(200).json({
      success: true,
      message: "Quantidade atualizada.",
      produto_id: produtoIdNum,
      quantidade: q,
      stock,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("PATCH /api/cart/items rollback erro:", rb);
    }

    console.error("PATCH /api/cart/items erro:", e);

    if (e instanceof AppError && e.code === "STOCK_LIMIT") {
      return res.status(409).json({
        code: "STOCK_LIMIT",
        message: e.message,
        max: e.meta?.max ?? null,
        current: e.meta?.current ?? null,
        requested: e.meta?.requested ?? null,
      });
    }

    return next(
      e instanceof AppError
        ? e
        : new AppError(
            "Erro ao atualizar item do carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
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
  const produtoId = toInt(req.params.produtoId);
  const userId = req.user?.id;

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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return res.status(200).json({ success: true, message: "Carrinho já vazio." });
    }

    await conn.query(
      "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
      [carrinho.id, produtoId]
    );

    await conn.commit();
    return res.json({ success: true, message: "Item removido do carrinho." });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("DELETE /api/cart/items/:produtoId rollback erro:", rb);
    }

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
  } finally {
    conn.release();
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return res
        .status(200)
        .json({ success: true, message: "Carrinho já estava vazio." });
    }

    await conn.query("DELETE FROM carrinho_itens WHERE carrinho_id = ?", [
      carrinho.id,
    ]);

    await conn.query('UPDATE carrinhos SET status = "fechado" WHERE id = ?', [
      carrinho.id,
    ]);

    await conn.commit();
    return res.json({ success: true, message: "Carrinho limpo." });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("DELETE /api/cart rollback erro:", rb);
    }

    console.error("DELETE /api/cart erro:", e);

    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao limpar carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  } finally {
    conn.release();
  }
});

module.exports = router;
