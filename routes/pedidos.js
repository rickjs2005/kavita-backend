const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const { parseAddress } = require("../utils/address");

/* ----------------------------- Swagger (YAML) ----------------------------- */
/**
 * @openapi
 * tags:
 *   - name: Pedidos
 *     description: Endpoints para consulta de pedidos do cliente
 */
/**
 * @openapi
 * components:
 *   schemas:
 *     PedidoResumo:
 *       type: object
 *       properties:
 *         id:            { type: integer, example: 42 }
 *         usuario_id:    { type: integer, example: 11 }
 *         forma_pagamento:
 *           type: string
 *           example: pix
 *         status:
 *           type: string
 *           example: pendente
 *         data_pedido:
 *           type: string
 *           format: date-time
 *           example: "2025-11-08T15:23:00Z"
 *         total:
 *           type: number
 *           format: float
 *           example: 199.9
 *     PedidoItem:
 *       type: object
 *       properties:
 *         id:         { type: integer, example: 10 }
 *         nome:       { type: string,  example: "Iogurte 900ml Morango" }
 *         preco:      { type: number,  format: float, example: 12.5 }
 *         quantidade: { type: integer, example: 3 }
 *         imagem:     { type: string,  nullable: true, example: "/uploads/produto.jpg" }
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
 *         description: Lista de pedidos (pode ser vazia)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PedidoResumo'
 *       400: { description: Parâmetro inválido }
 *       500: { description: Erro ao listar pedidos }
 */
<<<<<<< HEAD
=======
router.get("/", async (req, res) => {
  const { usuario_id } = req.query;

  try {
    let sql = `
      SELECT p.id, p.usuario_id, p.forma_pagamento, p.status, p.data_pedido,
             COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
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

>>>>>>> e32923eee2d71eeeceaefbc041610dc629ce8a62
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
 *         schema: { type: integer }
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Detalhe do pedido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PedidoDetalhe' }
 *       400: { description: Parâmetro inválido }
 *       404: { description: Pedido não encontrado }
 *       500: { description: Erro ao buscar pedido }
 */
/* ------------------------------------------------------------------------- */

/* -------------------------- Auto-detector de colunas -------------------------- */
const columnCache = {
  ready: false,
  db: null,
  // pedidos_produtos
  pivotPrice: null,   // preco_unitario | preco | price | valor
  // products
  prodPrice: null,    // preco | price | valor
  prodName: null,     // nome | name | title
  prodImage: null,    // imagem | image | img | path | foto | photo
};

async function getCurrentDb() {
  const [[row]] = await pool.query("SELECT DATABASE() AS db");
  return row.db;
}

async function pickColumn(table, candidates) {
  const db = columnCache.db || (columnCache.db = await getCurrentDb());
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME as name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  const set = new Set(rows.map((r) => r.name.toLowerCase()));
  for (const c of candidates) {
    if (set.has(c.toLowerCase())) return c; // devolve o nome real
  }
  return null;
}

async function ensureColumnMap() {
  if (columnCache.ready) return columnCache;

  columnCache.pivotPrice = await pickColumn("pedidos_produtos", [
    "preco_unitario",
    "preco",
    "price",
    "valor",
  ]);

  columnCache.prodPrice = await pickColumn("products", [
    "preco",
    "price",
    "valor",
  ]);

  columnCache.prodName = await pickColumn("products", [
    "nome",
    "name",
    "title",
  ]);

  columnCache.prodImage = await pickColumn("products", [
    "imagem",
    "image",
    "img",
    "path",
    "foto",
    "photo",
  ]);

  columnCache.ready = true;
  return columnCache;
}

/* ---------------------------------- Rotas ---------------------------------- */

// GET /api/pedidos
router.get("/", async (req, res) => {
  try {
    const raw = req.query.usuario_id ?? null;
    const usuarioId =
      raw == null ? null : Number(String(raw).replace(/\D/g, "")) || null;

    const cols = await ensureColumnMap();

    // expressão de preço usada nas somas (pivot > product > 0)
    const priceExpr = cols.pivotPrice
      ? `pp.${cols.pivotPrice}`
      : cols.prodPrice
      ? `pr.${cols.prodPrice}`
      : `0`;

    let sql = `
      SELECT
        p.id,
        p.usuario_id,
        p.forma_pagamento,
        p.status,
        p.data_pedido,
        SUM(pp.quantidade * COALESCE(${priceExpr}, 0)) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      ${cols.prodPrice || cols.prodName || cols.prodImage ? "LEFT JOIN products pr ON pr.id = pp.produto_id" : ""}
    `;
    const params = [];

    if (usuarioId) {
      sql += " WHERE p.usuario_id = ?";
      params.push(usuarioId);
    }

    sql += " GROUP BY p.id ORDER BY p.data_pedido DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows); // sempre 200 com array
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ message: "Erro ao listar pedidos" });
  }
});

// GET /api/pedidos/:id
router.get("/:id", async (req, res) => {
  try {
    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) return res.status(400).json({ message: "id inválido" });

    const cols = await ensureColumnMap();

    const priceExpr = cols.pivotPrice
      ? `pp.${cols.pivotPrice}`
      : cols.prodPrice
      ? `pr.${cols.prodPrice}`
      : `0`;

    // Cabeçalho com total
    const [[pedido]] = await pool.query(
      `
      SELECT
        p.id,
        p.usuario_id,
        p.forma_pagamento,
        p.status,
        p.data_pedido,
        SUM(pp.quantidade * COALESCE(${priceExpr}, 0)) AS total
      FROM pedidos p
      LEFT JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      ${cols.prodPrice ? "LEFT JOIN products pr ON pr.id = pp.produto_id" : ""}
      WHERE p.id = ?
      GROUP BY p.id
      `,
      [pedidoId]
    );

    if (!pedido) return res.status(404).json({ message: "Pedido não encontrado" });

    // Itens: preço do pivot > product > 0; nome/imagem só se existirem
    const selectNome = cols.prodName ? `, pr.${cols.prodName} AS nome` : `, NULL AS nome`;
    const selectImagem = cols.prodImage ? `, pr.${cols.prodImage} AS imagem` : `, NULL AS imagem`;

<<<<<<< HEAD
    const [itens] = await pool.query(
      `
      SELECT
        pp.id,
        pp.quantidade,
        COALESCE(${priceExpr}, 0) AS preco
        ${selectNome}
        ${selectImagem}
      FROM pedidos_produtos pp
      ${cols.prodName || cols.prodImage || (!cols.pivotPrice && cols.prodPrice) ? "LEFT JOIN products pr ON pr.id = pp.produto_id" : ""}
      WHERE pp.pedido_id = ?
      `,
      [pedidoId]
    );

    res.json({ ...pedido, itens });
=======
    const [itens] = await pool.query(
      `SELECT pr.id, pr.name, pp.valor_unitario, pp.quantidade
       FROM pedidos_produtos pp
       JOIN products pr ON pr.id = pp.produto_id
       WHERE pp.pedido_id = ?`,
      [id]
    );

    const total = itens.reduce(
      (sum, i) => sum + Number(i.valor_unitario) * Number(i.quantidade),
      0
    );

    const itensFormatados = itens.map((item) => ({
      id: item.id,
      nome: item.name,
      preco: Number(item.valor_unitario),
      quantidade: item.quantidade,
    }));

    res.json({
      ...pedido,
      endereco: parseAddress(pedido.endereco),
      itens: itensFormatados,
      total,
    });
>>>>>>> e32923eee2d71eeeceaefbc041610dc629ce8a62
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    res.status(500).json({ message: "Erro ao buscar pedido" });
  }
});

module.exports = router;
