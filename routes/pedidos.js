const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authenticateToken = require("../middleware/authenticateToken");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/* ----------------------------- Swagger ----------------------------- */
/**
 * @openapi
 * tags:
 *   - name: Pedidos
 *     description: Endpoints para consulta de pedidos do cliente autenticado
 */

/* ------------------------ GET /api/pedidos ------------------------- */
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return next(
        new AppError(
          "Usuário não autenticado ou token inválido.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const sql = `
      SELECT
        p.id,
        p.usuario_id,
        p.forma_pagamento,
        p.status,
        p.data_pedido,
        SUM(pp.quantidade * pp.valor_unitario) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.usuario_id = ?
      GROUP BY p.id
      ORDER BY p.data_pedido DESC
    `;

    const [rows] = await pool.query(sql, [usuarioId]);

    return res.json(rows);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    return next(
      new AppError(
        "Erro ao listar pedidos.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
});

/* --------------------- GET /api/pedidos/:id ------------------------ */
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return next(
        new AppError(
          "Usuário não autenticado ou token inválido.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) {
      return next(
        new AppError(
          "ID do pedido inválido.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const [[pedido]] = await pool.query(
      `
      SELECT
        p.id,
        p.usuario_id,
        p.forma_pagamento,
        p.status,
        p.data_pedido,
        p.endereco,
        SUM(pp.quantidade * pp.valor_unitario) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.id = ? AND p.usuario_id = ?
      GROUP BY p.id
      `,
      [pedidoId, usuarioId]
    );

    if (!pedido) {
      return next(
        new AppError(
          "Pedido não encontrado.",
          ERROR_CODES.NOT_FOUND,
          404
        )
      );
    }

    const [itens] = await pool.query(
      `
      SELECT
        pp.id,
        pp.produto_id,
        pp.quantidade,
        pp.valor_unitario AS preco,
        pr.name AS nome,
        pr.image AS imagem
      FROM pedidos_produtos pp
      JOIN products pr ON pr.id = pp.produto_id
      WHERE pp.pedido_id = ?
      `,
      [pedidoId]
    );

    const itensFormatados = itens.map((i) => ({
      id: i.id,
      produto_id: i.produto_id,
      nome: i.nome,
      preco: Number(i.preco),
      quantidade: i.quantidade,
      imagem: i.imagem,
    }));

    const totalCalculado = itensFormatados.reduce(
      (sum, i) => sum + i.preco * i.quantidade,
      0
    );

    return res.json({
      id: pedido.id,
      usuario_id: pedido.usuario_id,
      forma_pagamento: pedido.forma_pagamento,
      status: pedido.status,
      data_pedido: pedido.data_pedido,
      endereco: pedido.endereco ?? null,
      total: totalCalculado,
      itens: itensFormatados,
    });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    return next(
      new AppError(
        "Erro ao buscar pedido.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
});

module.exports = router;
