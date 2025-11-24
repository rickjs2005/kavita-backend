// routes/adminStats.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * tags:
 *   - name: AdminStats
 *     description: Métricas e estatísticas do painel administrativo
 */

/**
 * @openapi
 * /api/admin/stats/resumo:
 *   get:
 *     tags: [AdminStats]
 *     summary: Retorna resumo numérico para o dashboard admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Resumo de métricas do painel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalProdutos:        { type: integer }
 *                 totalPedidosUltimos30:{ type: integer }
 *                 totalClientes:        { type: integer }
 *                 totalDestaques:       { type: integer }
 *                 totalServicos:        { type: integer }
 *                 totalVendas30Dias:    { type: number, format: float }
 *                 ticketMedio:          { type: number, format: float }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.get("/resumo", verifyAdmin, async (_req, res) => {
  try {
    // total de produtos
    const [[prodRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM products"
    );
    const totalProdutos = Number(prodRow.total || 0);

    // pedidos nos últimos 30 dias (qualquer status)
    const [[pedRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM pedidos WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    const totalPedidosUltimos30 = Number(pedRow.total || 0);

    // total de clientes
    const [[cliRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM usuarios"
    );
    const totalClientes = Number(cliRow.total || 0);

    // total de destaques
    const [[destRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM destaques"
    );
    const totalDestaques = Number(destRow.total || 0);

    // total de serviços (colaboradores)
    const [[servRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM colaboradores"
    );
    const totalServicos = Number(servRow.total || 0);

    // total de vendas e ticket médio (somente pedidos pagos nos últimos 30 dias)
    const [[vendasRow]] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS totalVendas,
        COUNT(DISTINCT p.id) AS pedidosPagos
      FROM pedidos p
      JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.status_pagamento = 'pago'
        AND p.data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `
    );

    const totalVendas30Dias = Number(vendasRow.totalVendas || 0);
    const pedidosPagos30 = Number(vendasRow.pedidosPagos || 0);
    const ticketMedio =
      pedidosPagos30 > 0 ? totalVendas30Dias / pedidosPagos30 : 0;

    res.json({
      totalProdutos,
      totalPedidosUltimos30,
      totalClientes,
      totalDestaques,
      totalServicos,
      totalVendas30Dias,
      ticketMedio,
    });
  } catch (err) {
    console.error("Erro em /api/admin/stats/resumo:", err);
    res.status(500).json({ message: "Erro ao buscar resumo de stats." });
  }
});

/**
 * @openapi
 * /api/admin/stats/vendas:
 *   get:
 *     tags: [AdminStats]
 *     summary: Série de vendas diárias para gráfico
 *     description: Retorna vendas por dia (pedidos pagos) nos últimos N dias.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 90
 *         description: Quantidade de dias para trás a partir de hoje.
 *     responses:
 *       200:
 *         description: Série temporal de vendas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rangeDays: { type: integer }
 *                 points:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:  { type: string, example: "2025-11-20" }
 *                       total: { type: number, format: float }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.get("/vendas", verifyAdmin, async (req, res) => {
  try {
    const rangeRaw = parseInt(String(req.query.range || "7"), 10);
    const rangeDays = Math.min(Math.max(rangeRaw || 7, 1), 90);

    const [rows] = await pool.query(
      `
      SELECT 
        DATE(p.data_pedido) AS dia,
        COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS total
      FROM pedidos p
      JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.status_pagamento = 'pago'
        AND p.data_pedido >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(p.data_pedido)
      ORDER BY dia ASC
      `,
      [rangeDays]
    );

    // monta um mapa dia -> total
    const map = new Map();
    for (const r of rows) {
      const key = r.dia instanceof Date
        ? r.dia.toISOString().slice(0, 10)
        : String(r.dia);
      map.set(key, Number(r.total || 0));
    }

    // garante todos os dias até hoje, mesmo se tiver 0 de venda
    const today = new Date();
    const points = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({
        date: key,
        total: map.get(key) || 0,
      });
    }

    res.json({ rangeDays, points });
  } catch (err) {
    console.error("Erro em /api/admin/stats/vendas:", err);
    res.status(500).json({ message: "Erro ao buscar série de vendas." });
  }
});

/**
 * @openapi
 * /api/admin/stats/produtos-mais-vendidos:
 *   get:
 *     tags: [AdminStats]
 *     summary: Lista produtos mais vendidos (por quantidade)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 20
 *     responses:
 *       200:
 *         description: Produtos mais vendidos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:                { type: integer }
 *                   name:              { type: string }
 *                   quantidadeVendida: { type: integer }
 *                   totalVendido:      { type: number, format: float }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.get("/produtos-mais-vendidos", verifyAdmin, async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || "5"), 10);
    const limit = Math.min(Math.max(limitRaw || 5, 1), 20);

    const [rows] = await pool.query(
      `
      SELECT
        pr.id,
        pr.name,
        SUM(pp.quantidade) AS quantidadeVendida,
        SUM(pp.quantidade * pp.valor_unitario) AS totalVendido
      FROM pedidos_produtos pp
      JOIN pedidos p   ON p.id = pp.pedido_id
      JOIN products pr ON pr.id = pp.produto_id
      WHERE p.status_pagamento = 'pago'
      GROUP BY pr.id, pr.name
      ORDER BY quantidadeVendida DESC
      LIMIT ?
      `,
      [limit]
    );

    const result = rows.map((r) => ({
      id: r.id,
      name: r.name,
      quantidadeVendida: Number(r.quantidadeVendida || 0),
      totalVendido: Number(r.totalVendido || 0),
    }));

    res.json(result);
  } catch (err) {
    console.error("Erro em /api/admin/stats/produtos-mais-vendidos:", err);
    res.status(500).json({ message: "Erro ao buscar produtos mais vendidos." });
  }
});

module.exports = router;
