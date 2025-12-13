const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authenticateToken = require("../middleware/authenticateToken");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

router.use(authenticateToken);

/**
 * GET /api/cart
 * Retorna o carrinho ABERTO mais recente do usuário logado.
 */
router.get("/", async (req, res, next) => {
  const userId = req.user?.id;

  try {
    if (!userId) {
      return next(
        new AppError(
          "Usuário não autenticado.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const [[carrinho]] = await pool.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) return res.json({ items: [] });

    const [itens] = await pool.query(
      `SELECT ci.id, ci.produto_id, ci.quantidade, ci.valor_unitario, p.name as nome, p.image
       FROM carrinho_itens ci
       JOIN products p ON p.id = ci.produto_id
       WHERE ci.carrinho_id = ?`,
      [carrinho.id]
    );

    return res.json({ carrinho_id: carrinho.id, items: itens });
  } catch (e) {
    console.error("GET /api/cart erro:", e);
    return next(
      new AppError(
        "Erro ao carregar carrinho.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
});

/**
 * POST /api/cart/items
 * Adiciona (ou incrementa) um produto no carrinho aberto do usuário.
 */
router.post("/items", async (req, res, next) => {
  const { produto_id, quantidade } = req.body || {};
  const userId = req.user?.id;

  const produtoIdNum = Number(produto_id);
  const qtdNum = Number(quantidade);

  if (!userId) {
    return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
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

    const [[produto]] = await conn.query(
      "SELECT id, price FROM products WHERE id = ?",
      [produtoIdNum]
    );

    if (!produto) {
      throw new AppError(
        "Produto não encontrado.",
        ERROR_CODES.NOT_FOUND,
        404
      );
    }

    const [[existente]] = await conn.query(
      "SELECT * FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
      [carrinhoId, produtoIdNum]
    );

    if (existente) {
      await conn.query(
        "UPDATE carrinho_itens SET quantidade = quantidade + ? WHERE id = ?",
        [qtdNum, existente.id]
      );
    } else {
      await conn.query(
        `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [carrinhoId, produtoIdNum, qtdNum, produto.price]
      );
    }

    await conn.commit();
    return res.status(200).json({ message: "Produto adicionado ao carrinho" });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("POST /api/cart/items rollback erro:", rb);
    }

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
  } finally {
    conn.release();
  }
});

/**
 * PATCH /api/cart/items
 * Atualiza a quantidade de um produto no carrinho.
 * Body: { produto_id, quantidade }
 * - Se quantidade <= 0 → remove o item.
 */
router.patch("/items", async (req, res, next) => {
  const { produto_id, quantidade } = req.body || {};
  const userId = req.user?.id;

  const produtoIdNum = Number(produto_id);
  const q = Number(quantidade || 0);

  if (!userId) {
    return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
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
      new AppError(
        "quantidade inválida.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
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
      return res.status(200).json({ message: "Carrinho já vazio." });
    }

    if (q <= 0) {
      await conn.query(
        "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
        [carrinho.id, produtoIdNum]
      );
    } else {
      await conn.query(
        "UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?",
        [q, carrinho.id, produtoIdNum]
      );
    }

    await conn.commit();
    return res.json({ message: "Quantidade atualizada." });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("PATCH /api/cart/items rollback erro:", rb);
    }

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
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/cart/items/:produtoId
 * Remove um item específico do carrinho aberto.
 */
router.delete("/items/:produtoId", async (req, res, next) => {
  const produtoId = Number(req.params.produtoId);
  const userId = req.user?.id;

  if (!userId) {
    return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
  }

  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return next(
      new AppError(
        "produtoId inválido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
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
      return res.status(200).json({ message: "Carrinho já vazio." });
    }

    await conn.query(
      "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
      [carrinho.id, produtoId]
    );

    await conn.commit();
    return res.json({ message: "Item removido do carrinho." });
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
 * DELETE /api/cart
 * Limpa o carrinho aberto do usuário (e opcionalmente fecha).
 */
router.delete("/", async (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
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
      return res.status(200).json({ message: "Carrinho já estava vazio." });
    }

    await conn.query("DELETE FROM carrinho_itens WHERE carrinho_id = ?", [
      carrinho.id,
    ]);

    await conn.query('UPDATE carrinhos SET status = "fechado" WHERE id = ?', [
      carrinho.id,
    ]);

    await conn.commit();
    return res.json({ message: "Carrinho limpo." });
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
        : new AppError(
            "Erro ao limpar carrinho.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
  }
});

module.exports = router;
