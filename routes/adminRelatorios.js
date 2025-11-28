const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * tags:
 *   - name: Relatórios
 *     description: Relatórios e métricas do e-commerce
 */

const handleErro = (res, err, contexto) => {
  console.error(`Erro ao ${contexto}:`, err);
  res.status(500).json({ message: `Erro ao ${contexto}` });
};

/**
 * @openapi
 * /api/admin/relatorios/vendas:
 *   get:
 *     tags: [Relatórios]
 *     summary: Retorna total de vendas por dia
 *     description: Ideal para gráficos de linha ou barras
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de vendas por dia
 */
router.get("/vendas", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(p.data_pedido) AS dia,
        SUM(p.total) AS total
      FROM pedidos p
      WHERE p.status_pagamento = 'pago'
      GROUP BY dia
      ORDER BY dia ASC
    `);

    res.json({
      labels: rows.map((r) => r.dia),
      values: rows.map((r) => Number(r.total)),
      rows,
    });
  } catch (err) {
    handleErro(res, err, "buscar relatório de vendas");
  }
});

/**
 * @openapi
 * /api/admin/relatorios/produtos-mais-vendidos:
 *   get:
 *     tags: [Relatórios]
 *     summary: Produtos mais vendidos
 *     security:
 *       - BearerAuth: []
 */
router.get("/produtos-mais-vendidos", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        pr.id,
        pr.name,
        SUM(pp.quantidade) AS vendidos,
        SUM(pp.quantidade * pp.valor_unitario) AS total_faturado
      FROM pedidos_produtos pp
      JOIN products pr ON pr.id = pp.produto_id
      GROUP BY pr.id, pr.name
      ORDER BY vendidos DESC
      LIMIT 20
    `);

    res.json({
      labels: rows.map((r) => r.name),
      values: rows.map((r) => Number(r.vendidos)),
      rows,
    });
  } catch (err) {
    handleErro(res, err, "buscar produtos mais vendidos");
  }
});

/**
 * @openapi
 * /api/admin/relatorios/clientes-top:
 *   get:
 *     tags: [Relatórios]
 *     summary: Clientes que mais compraram (em valor)
 *     security:
 *       - BearerAuth: []
 */
router.get("/clientes-top", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.email,
        COUNT(p.id) AS pedidos,
        SUM(p.total) AS total_gasto
      FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.status_pagamento = 'pago'
      GROUP BY u.id, u.nome, u.email
      ORDER BY total_gasto DESC
      LIMIT 20
    `);

    res.json({
      labels: rows.map((r) => r.nome),
      values: rows.map((r) => Number(r.total_gasto)),
      rows,
    });
  } catch (err) {
    handleErro(res, err, "buscar top clientes");
  }
});

/**
 * @openapi
 * /api/admin/relatorios/estoque:
 *   get:
 *     tags: [Relatórios]
 *     summary: Lista todos os produtos com seus estoques
 *     description: Relatório geral de estoque (todos os produtos).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos com estoque
 */
router.get("/estoque", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        quantity,
        price
      FROM products
      ORDER BY quantity ASC
    `);

    res.json(rows);
  } catch (err) {
    handleErro(res, err, "buscar estoque geral");
  }
});

/**
 * @openapi
 * /api/admin/relatorios/estoque-baixo:
 *   get:
 *     tags: [Relatórios]
 *     summary: Lista produtos com estoque baixo
 *     description: Apenas produtos com quantidade menor ou igual a 5.
 *     security:
 *       - BearerAuth: []
 */
router.get("/estoque-baixo", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        quantity,
        price
      FROM products
      WHERE quantity <= 5
      ORDER BY quantity ASC
    `);

    res.json(rows);
  } catch (err) {
    handleErro(res, err, "buscar estoque baixo");
  }
});

/**
 * @openapi
 * /api/admin/relatorios/servicos:
 *   get:
 *     tags: [Relatórios]
 *     summary: Relatório de serviços / colaboradores por especialidade
 *     description: Retorna quantos serviços existem por especialidade, pronto para gráfico e tabela.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas de serviços
 *       500:
 *         description: Erro ao buscar relatório de serviços
 */
router.get("/servicos", verifyAdmin, async (_req, res) => {
  try {
    const [porEspecialidade] = await pool.query(`
      SELECT 
        e.id AS especialidade_id,
        e.nome AS especialidade_nome,
        COUNT(c.id) AS total_servicos
      FROM colaboradores c
      LEFT JOIN especialidades e ON c.especialidade_id = e.id
      GROUP BY e.id, e.nome
      ORDER BY total_servicos DESC, especialidade_nome ASC
    `);

    const [[totais]] = await pool.query(`
      SELECT 
        COUNT(*) AS total_servicos
      FROM colaboradores
    `);

    res.json({
      totalServicos: Number(totais.total_servicos || 0),
      labels: porEspecialidade.map((r) => r.especialidade_nome || "Sem categoria"),
      values: porEspecialidade.map((r) => Number(r.total_servicos)),
      porEspecialidade,
    });
  } catch (err) {
    console.error("Erro ao buscar relatório de serviços:", err);
    res.status(500).json({ message: "Erro ao buscar relatório de serviços." });
  }
});

module.exports = router;
