// routes/publicServicos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/* ------------------ helpers ------------------ */
function normalizeImages(images) {
  if (!images) return [];
  try {
    if (typeof images === "string") {
      const s = images.trim();
      if (s.startsWith("[") && s.endsWith("]")) {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      }
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (Array.isArray(images)) return images.filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

/** Carrega as imagens dos colaboradores numa única consulta e agrega em memória */
async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [imgs] = await pool.query(
    "SELECT colaborador_id, path FROM colaborador_images WHERE colaborador_id IN (?)",
    [ids]
  );
  const bucket = imgs.reduce((acc, it) => {
    (acc[it.colaborador_id] ||= []).push(it.path);
    return acc;
  }, {});
  return rows.map((r) => ({
    ...r,
    images: (bucket[r.id] || []).filter(Boolean),
  }));
}

// Whitelist para ORDER BY
const SORT_MAP = {
  id: "c.id",
  nome: "c.nome",
  cargo: "c.cargo",
  especialidade: "e.nome",
};

/**
 * @openapi
 * /api/public/servicos:
 *   get:
 *     tags: [Public, Serviços]
 *     summary: Lista serviços (colaboradores) públicos com paginação
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/OrderParam'
 *     responses:
 *       200:
 *         description: Lista paginada de serviços
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedServices'
 *       500:
 *         description: Erro ao listar serviços
 */

/**
 * @openapi
 * /api/public/servicos/{id}:
 *   get:
 *     tags: [Public, Serviços]
 *     summary: Detalhe de um serviço ou colaborador específico
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalhes do serviço retornados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Service'
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro interno
 */

/* =====================================================
   GET /api/public/servicos
   Query:
     - page: número da página (default 1)
     - limit: itens por página (default 12, máx 100)
     - sort: id | nome | cargo | especialidade (default id)
     - order: asc | desc (default desc)
===================================================== */
router.get("/", async (req, res) => {
  try {
    const {
      page = "1",
      limit = "12",
      sort = "id",
      order = "desc",
    } = req.query;

    // paginação segura
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    // ordenação segura
    const sortKey = String(sort).toLowerCase();
    const sortCol = SORT_MAP[sortKey] || SORT_MAP.id;
    const orderDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    // (se quiser filtros depois, monte where/params aqui)
    const whereSql = ""; // por enquanto sem filtros
    const params = [];

    // total
    const [[{ total }]] = await pool.query(
      `
      SELECT COUNT(*) AS total
        FROM colaboradores c
        LEFT JOIN especialidades e ON e.id = c.especialidade_id
      ${whereSql}
      `,
      params
    );

    // dados paginados + ordenados
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem    AS imagem_capa,     -- capa salva no colaborador
        c.descricao AS descricao,
        c.especialidade_id,
        e.nome      AS especialidade_nome
      FROM colaboradores c
      LEFT JOIN especialidades e ON e.id = c.especialidade_id
      ${whereSql}
      ORDER BY ${sortCol} ${orderDir}
      LIMIT ? OFFSET ?
    `,
      [...params, limitNum, offset]
    );

    const withImages = await attachImages(rows);

    const data = withImages.map((r) => {
      const extraFromColab = normalizeImages(r.images); // já é array, normalizamos por segurança
      const imagem = r.imagem_capa || extraFromColab[0] || null;

      return {
        id: r.id,
        nome: r.nome,
        descricao: r.descricao,
        imagem,             // capa final
        images: extraFromColab,
        cargo: r.cargo,
        whatsapp: r.whatsapp,
        especialidade_id: r.especialidade_id,
        especialidade_nome: r.especialidade_nome,
      };
    });

    res.json({
      data,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      sort: sortKey,
      order: orderDir.toLowerCase(),
    });
  } catch (err) {
    console.error("Erro ao listar serviços públicos:", err);
    res.status(500).json({ message: "Erro interno ao listar serviços." });
  }
});

/* =====================================================
   GET /api/public/servicos/:id
   - Detalhe de um serviço/colaborador específico
===================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem    AS imagem_capa,
        c.descricao AS descricao,
        c.especialidade_id,
        e.nome      AS especialidade_nome
      FROM colaboradores c
      LEFT JOIN especialidades e ON e.id = c.especialidade_id
      WHERE c.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    const withImages = await attachImages(rows);
    const r = withImages[0];

    const lista = normalizeImages(r.images);
    const imagem = r.imagem_capa || lista[0] || null;

    res.json({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      imagem,
      images: lista,
      cargo: r.cargo,
      whatsapp: r.whatsapp,
      especialidade_id: r.especialidade_id,
      especialidade_nome: r.especialidade_nome,
    });
  } catch (err) {
    console.error("Erro ao obter serviço público:", err);
    res.status(500).json({ message: "Erro interno ao obter serviço." });
  }
});

module.exports = router;
