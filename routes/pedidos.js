const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authenticateToken = require("../middleware/authenticateToken");

// Se quiser usar depois para formatar o endereço como objeto:
// const { parseAddress } = require("../utils/address");

/* ----------------------------- Swagger ----------------------------- */
/**
 * @openapi
 * tags:
 *   - name: Pedidos
 *     description: Endpoints para consulta de pedidos do cliente autenticado
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PedidoResumo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 42
 *         usuario_id:
 *           type: integer
 *           example: 11
 *         forma_pagamento:
 *           type: string
 *           example: "pix"
 *         status:
 *           type: string
 *           example: "pendente"
 *         data_pedido:
 *           type: string
 *           format: date-time
 *           example: "2025-11-08T15:23:00Z"
 *         total:
 *           type: number
 *           format: float
 *           example: 199.9
 *
 *     PedidoItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 10
 *         nome:
 *           type: string
 *           example: "Vermífugo Oral para Bezerros 1L"
 *         preco:
 *           type: number
 *           format: float
 *           example: 55.0
 *         quantidade:
 *           type: integer
 *           example: 2
 *         imagem:
 *           type: string
 *           nullable: true
 *           example: "/uploads/produto.jpg"
 *
 *     PedidoDetalhe:
 *       allOf:
 *         - $ref: '#/components/schemas/PedidoResumo'
 *         - type: object
 *           properties:
 *             endereco:
 *               type: string
 *               nullable: true
 *               description: Endereço de entrega (string formatada ou JSON serializado)
 *             itens:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PedidoItem'
 */

/**
 * @openapi
 * /api/pedidos:
 *   get:
 *     summary: Lista pedidos do usuário autenticado
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos (pode ser vazia)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PedidoResumo'
 *       401:
 *         description: Token não fornecido ou inválido
 *       500:
 *         description: Erro ao listar pedidos
 */

/* ------------------------ GET /api/pedidos ------------------------- */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res
        .status(401)
        .json({ message: "Usuário não autenticado ou token inválido." });
    }

    let sql = `
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
    // sempre devolve array (mesmo vazio)
    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ message: "Erro ao listar pedidos" });
  }
});

/**
 * @openapi
 * /api/pedidos/{id}:
 *   get:
 *     summary: Obtém detalhes de um pedido do usuário autenticado
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Detalhe do pedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PedidoDetalhe'
 *       400:
 *         description: Parâmetro inválido
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Pedido não pertence ao usuário autenticado
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao buscar pedido
 */

/* --------------------- GET /api/pedidos/:id ------------------------ */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return res
        .status(401)
        .json({ message: "Usuário não autenticado ou token inválido." });
    }

    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) {
      return res.status(400).json({ message: "id inválido" });
    }

    // Cabeçalho do pedido + total calculado, garantindo que o pedido é do usuário logado
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
      // ou não existe, ou não pertence ao usuário autenticado
      return res.status(404).json({ message: "Pedido não encontrado" });
    }

    // Itens do pedido
    const [itens] = await pool.query(
      `
      SELECT
        pp.id,
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
      nome: i.nome,
      preco: Number(i.preco),
      quantidade: i.quantidade,
      imagem: i.imagem,
    }));

    const totalCalculado = itensFormatados.reduce(
      (sum, i) => sum + i.preco * i.quantidade,
      0
    );

    // Mantém endereco como STRING, igual o frontend espera
    res.json({
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
    res.status(500).json({ message: "Erro ao buscar pedido" });
  }
});

module.exports = router;
