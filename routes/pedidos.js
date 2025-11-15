const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/**
 * @openapi
 * tags:
 *   name: Pedidos
 *   description: Endpoints para consulta de pedidos do cliente
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PedidoResumo:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 42 }
 *         usuario_id: { type: integer, example: 1 }
 *         forma_pagamento: { type: string, example: "pix" }
 *         status: { type: string, example: "processando" }
 *         data_pedido: { type: string, format: date-time, example: "2025-11-08T15:23:00Z" }
 *         total: { type: number, format: float, example: 199.9 }
 *     PedidoItem:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 10 }
 *         nome: { type: string, example: "Iogurte 900ml Morango" }
 *         preco: { type: number, format: float, example: 12.5 }
 *         quantidade: { type: integer, example: 3 }
 *     PedidoDetalhe:
 *       allOf:
 *         - $ref: '#/components/schemas/PedidoResumo'
 *         - type: object
 *           properties:
 *             itens:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PedidoItem'
 */

/**
 * @openapi
 * /api/pedidos:
 *   get:
 *     summary: Lista pedidos (opcionalmente filtrando por usuário)
 *     tags: [Pedidos]
 *     parameters:
 *       - in: query
 *         name: usuario_id
 *         schema:
 *           type: integer
 *         description: Filtra por ID do usuário
 *     responses:
 *       200:
 *         description: Lista de pedidos
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PedidoResumo'
 *       500:
 *         description: Erro ao listar pedidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
router.get("/", async (req, res) => {
  const { usuario_id } = req.query;

  try {
    let sql = `
      SELECT p.id, p.usuario_id, p.forma_pagamento, p.status, p.data_pedido,
             COALESCE(SUM(pp.quantidade * pr.preco), 0) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      LEFT JOIN products pr ON pr.id = pp.produto_id
    `;
    const params = [];

    if (usuario_id) {
      sql += " WHERE p.usuario_id = ?";
      params.push(usuario_id);
    }

    sql += " GROUP BY p.id ORDER BY p.data_pedido DESC";

    const [rows] = await pool.query(sql, params);
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
 *     summary: Obtém detalhes de um pedido
 *     tags: [Pedidos]
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
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PedidoDetalhe'
 *       404:
 *         description: Pedido não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       500:
 *         description: Erro ao buscar pedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [[pedido]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [
      id,
    ]);

    if (!pedido)
      return res.status(404).json({ message: "Pedido não encontrado" });

    const [itens] = await pool.query(
      `SELECT pr.id, pr.nome, pr.preco, pp.quantidade
       FROM pedidos_produtos pp
       JOIN products pr ON pr.id = pp.produto_id
       WHERE pp.pedido_id = ?`,
      [id]
    );

    const total = itens.reduce(
      (sum, i) => sum + Number(i.preco) * Number(i.quantidade),
      0
    );

    res.json({ ...pedido, itens, total });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    res.status(500).json({ message: "Erro ao buscar pedido" });
  }
});

module.exports = router;
