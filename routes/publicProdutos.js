// routes/publicProdutos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com o banco de dados
const authenticateToken = require("../middleware/authenticateToken");

// Campos padrão que queremos expor publicamente de products
const PUBLIC_PRODUCT_FIELDS = `
  id,
  name,
  CAST(price AS DECIMAL(10,2)) AS price,
  image,
  rating_avg,
  rating_count,
  shipping_free,
  shipping_free_from_qty
`;

/**
 * @openapi
 * /api/public/produtos:
 *   get:
 *     tags: [Public, Produtos]
 *     summary: Busca rápida de produtos por nome
 *     description: Retorna até 10 produtos correspondentes ao termo informado na query `busca`.
 *     parameters:
 *       - name: busca
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "fertilizante"
 *         description: Termo parcial do nome do produto.
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           example: 10
 *         description: Quantidade máxima de produtos a retornar (padrão 10).
 *     responses:
 *       200:
 *         description: Produtos encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 *                   image:
 *                     type: string
 *                     nullable: true
 *                   rating_avg:
 *                     type: number
 *                     format: float
 *                     description: Nota média do produto (1 a 5).
 *                   rating_count:
 *                     type: integer
 *                     description: Quantidade de avaliações do produto.
 *                   shipping_free:
 *                     type: boolean
 *                     description: Se o produto tem frete grátis.
 *                   shipping_free_from_qty:
 *                     type: integer
 *                     nullable: true
 *                     description: Quantidade mínima para frete grátis (se aplicável).
 *       500:
 *         description: Erro interno ao buscar produtos
 */

// ✅ GET /api/public/produtos?busca=xxx — Busca rápida por nome do produto
router.get("/", async (req, res) => {
  const buscaRaw = req.query.busca;
  const limitRaw = req.query.limit;

  const busca =
    typeof buscaRaw === "string"
      ? buscaRaw.trim()
      : String(buscaRaw || "").trim();

  // Limite de resultados (padrão 10, máx 50)
  let limit = Number(limitRaw) || 10;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;

  // Se busca for vazia ou apenas espaços, retorna lista vazia
  if (!busca) {
    return res.json([]);
  }

  try {
    const sql = `
      SELECT
        ${PUBLIC_PRODUCT_FIELDS}
      FROM products
      WHERE name LIKE ?
      ORDER BY rating_avg DESC, rating_count DESC, name ASC
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [`%${busca}%`, limit]);

    console.log("🟢 Produtos encontrados na busca pública:", {
      busca,
      total: rows.length,
    });

    return res.json(rows);
  } catch (err) {
    console.error("🔴 Erro ao buscar produtos (público):", err);
    return res.status(500).json({ message: "Erro ao buscar produtos." });
  }
});

/**
 * @openapi
 * /api/public/produtos/avaliacoes:
 *   post:
 *     tags: [Public, Produtos]
 *     summary: Avaliar um produto (login obrigatório)
 *     description: Registra uma avaliação (nota e comentário) para um produto. O usuário é identificado pelo token.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - produto_id
 *               - nota
 *             properties:
 *               produto_id:
 *                 type: integer
 *                 example: 123
 *               nota:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comentario:
 *                 type: string
 *                 example: "Produto excelente, ajudou muito na lavoura!"
 *     responses:
 *       201:
 *         description: Avaliação registrada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado (token ausente/inválido)
 *       500:
 *         description: Erro interno ao registrar a avaliação
 */

// ✅ POST /api/public/produtos/avaliacoes — Cria avaliação de produto (LOGIN)
router.post("/avaliacoes", authenticateToken, async (req, res) => {
  const { produto_id, nota, comentario } = req.body || {};

  const produtoIdNum = Number(produto_id);
  const notaNum = Number(nota);

  if (!produtoIdNum || !notaNum || notaNum < 1 || notaNum > 5) {
    return res
      .status(400)
      .json({ message: "Informe produto_id e nota entre 1 e 5." });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    await conn.query(
      `
        INSERT INTO produto_avaliacoes (produto_id, usuario_id, nota, comentario)
        VALUES (?, ?, ?, ?)
      `,
      [produtoIdNum, usuarioId, notaNum, comentario || null]
    );

    // Recalcula média e quantidade de avaliações do produto
    const [[stats]] = await conn.query(
      `
        SELECT
          AVG(nota) AS media,
          COUNT(*) AS total
        FROM produto_avaliacoes
        WHERE produto_id = ?
      `,
      [produtoIdNum]
    );

    const media = stats?.media ? Number(stats.media) : 0;
    const total = stats?.total ? Number(stats.total) : 0;

    await conn.query(
      `
        UPDATE products
        SET rating_avg = ?, rating_count = ?
        WHERE id = ?
      `,
      [media, total, produtoIdNum]
    );

    await conn.commit();
    console.log("🟢 Avaliação de produto registrada com sucesso:", {
      produto_id: produtoIdNum,
      usuario_id: usuarioId,
      nota: notaNum,
      media,
      total,
    });

    return res
      .status(201)
      .json({ message: "Avaliação registrada com sucesso." });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("🔴 Erro ao registrar avaliação de produto:", err);
    return res
      .status(500)
      .json({ message: "Erro ao registrar avaliação do produto." });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * @openapi
 * /api/public/produtos/{id}/avaliacoes:
 *   get:
 *     tags: [Public, Produtos]
 *     summary: Listar avaliações de um produto (com nome do usuário)
 *     description: Retorna as avaliações já realizadas para um produto específico, incluindo o nome do usuário que comentou.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do produto.
 *     responses:
 *       200:
 *         description: Lista de avaliações
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   nota:
 *                     type: integer
 *                   comentario:
 *                     type: string
 *                     nullable: true
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   usuario_nome:
 *                     type: string
 *                     nullable: true
 *                     description: Nome do usuário que comentou.
 *       400:
 *         description: ID inválido
 *       500:
 *         description: Erro interno ao buscar avaliações
 */

// ✅ GET /api/public/produtos/:id/avaliacoes — Lista avaliações de um produto (COM NOME)
router.get("/:id/avaliacoes", async (req, res) => {
  const idNum = Number(req.params.id);

  if (!idNum) {
    return res.status(400).json({ message: "ID de produto inválido." });
  }

  try {
    const[rows] = await pool.query(
      `
        SELECT
          pa.nota,
          pa.comentario,
          pa.created_at,
          u.nome AS usuario_nome
        FROM produto_avaliacoes pa
        LEFT JOIN usuarios u ON u.id = pa.usuario_id
        WHERE pa.produto_id = ?
        ORDER BY pa.created_at DESC
        LIMIT 50
        `,
      [idNum]
    );

    console.log("🟢 Avaliações carregadas para produto:", idNum, rows.length);
    return res.json(rows);
  } catch (err) {
    console.error("🔴 Erro ao listar avaliações de produto:", err);
    return res
      .status(500)
      .json({ message: "Erro ao listar avaliações do produto." });
  }
});

module.exports = router;
