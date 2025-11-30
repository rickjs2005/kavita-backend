// routes/publicServicos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/* ------------------ helpers ------------------ */

/**
 * Normaliza diferentes formatos de imagens (string, array, JSON)
 * para sempre retornar um array de strings válidas.
 */
function normalizeImages(images) {
  if (!images) return [];
  try {
    if (typeof images === "string") {
      const s = images.trim();
      // Se for JSON de array
      if (s.startsWith("[") && s.endsWith("]")) {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      }
      // Se for string separada por vírgulas
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

/**
 * Carrega as imagens dos colaboradores numa única consulta e agrega em memória.
 */
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

/* ---------- Constantes de consulta ---------- */

// Whitelist para ORDER BY
const SORT_MAP = {
  id: "c.id",
  nome: "c.nome",
  cargo: "c.cargo",
  especialidade: "e.nome",
};

// SELECT base (reusado em listagem e detalhe)
const BASE_SELECT = `
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
`;

/**
 * Monta WHERE + params com base em filtros de busca e especialidade.
 * Sempre força verificado = 1 (só exibe aprovados).
 */
function buildWhereClause({ busca, especialidade }) {
  const where = ["c.verificado = 1"];
  const params = [];

  if (busca) {
    const term = `%${String(busca).trim()}%`;
    where.push("(c.nome LIKE ? OR c.cargo LIKE ? OR c.descricao LIKE ?)");
    params.push(term, term, term);
  }

  // CORREÇÃO DEFINITIVA – evita NaN no WHERE
  if (especialidade !== undefined && especialidade !== null && especialidade !== "") {
    const espId = Number(especialidade);
    if (Number.isFinite(espId)) {
      where.push("c.especialidade_id = ?");
      params.push(espId);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

/**
 * Transforma um registro cru do MySQL em um objeto limpo de serviço público.
 */
function mapRowToService(row) {
  const extraFromColab = normalizeImages(row.images);
  const imagem = row.imagem_capa || extraFromColab[0] || null;

  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    imagem, // capa final
    images: extraFromColab,
    cargo: row.cargo,
    whatsapp: row.whatsapp,
    especialidade_id: row.especialidade_id,
    especialidade_nome: row.especialidade_nome,
  };
}

/**
 * @openapi
 * /api/public/servicos:
 *   get:
 *     tags: [Public, Serviços]
 *     summary: Lista serviços (colaboradores) públicos com paginação e filtros
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/OrderParam'
 *       - name: busca
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Filtro por nome, cargo ou descrição do colaborador
 *       - name: especialidade
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *         description: Filtra por ID da especialidade do colaborador
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

/* =====================================================
   GET /api/public/servicos
   Query:
     - page: número da página (default 1)
     - limit: itens por página (default 12, máx 100)
     - sort: id | nome | cargo | especialidade (default id)
     - order: asc | desc (default desc)
     - busca: termo para nome/cargo/descrição (opcional)
     - especialidade: ID da especialidade (opcional)
===================================================== */
router.get("/", async (req, res) => {
  try {
    const {
      page = "1",
      limit = "12",
      sort = "id",
      order = "desc",
      busca = "",
      especialidade = "",
    } = req.query;

    // paginação segura
    const rawPage = parseInt(page, 10);
    const rawLimit = parseInt(limit, 10);

    const pageNum = Math.max(!Number.isNaN(rawPage) ? rawPage : 1, 1);
    const limitNum = Math.min(Math.max(!Number.isNaN(rawLimit) ? rawLimit : 12, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    // ordenação segura
    const sortKey = String(sort).toLowerCase();
    const sortCol = SORT_MAP[sortKey] || SORT_MAP.id;
    const orderDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    // filtros (WHERE + params compartilhados entre COUNT e SELECT)
    const { whereSql, params } = buildWhereClause({ busca, especialidade });

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
        ${BASE_SELECT}
        ${whereSql}
        ORDER BY ${sortCol} ${orderDir}
        LIMIT ? OFFSET ?
      `,
      [...params, limitNum, offset]
    );

    const withImages = await attachImages(rows);
    const data = withImages.map(mapRowToService);

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
   GET /api/public/servicos/:id
   Detalhe de um colaborador / serviço
===================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
        ${BASE_SELECT}
        WHERE c.id = ? AND c.verificado = 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    const [withImages] = await attachImages(rows);
    const service = mapRowToService(withImages);

    res.json(service);
  } catch (err) {
    console.error("Erro ao obter serviço público:", err);
    res.status(500).json({ message: "Erro interno ao obter serviço." });
  }
});

/**
 * @openapi
 * /api/public/servicos/solicitacoes:
 *   post:
 *     tags: [Public, Serviços]
 *     summary: Cria uma solicitação de serviço para um colaborador
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [colaborador_id, nome_contato, whatsapp, descricao]
 *             properties:
 *               colaborador_id:
 *                 type: integer
 *               nome_contato:
 *                 type: string
 *               whatsapp:
 *                 type: string
 *               descricao:
 *                 type: string
 *               origem:
 *                 type: string
 *                 description: "Origem da solicitação (ex: 'landing', 'kavita-app')"
 *     responses:
 *       201:
 *         description: Solicitação criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno
 */

/* =====================================================
   POST /api/public/servicos/solicitacoes
   Cria uma solicitação para um colaborador
===================================================== */
router.post("/solicitacoes", async (req, res) => {
  const { colaborador_id, nome_contato, whatsapp, descricao, origem } =
    req.body || {};

  if (!colaborador_id || !nome_contato || !whatsapp || !descricao) {
    return res.status(400).json({
      message:
        "Campos obrigatórios: colaborador_id, nome_contato, whatsapp, descricao.",
    });
  }

  try {
    const [result] = await pool.query(
      `
        INSERT INTO solicitacoes_servico
          (colaborador_id, nome_contato, whatsapp, descricao, origem)
        VALUES (?, ?, ?, ?, ?)
      `,
      [colaborador_id, nome_contato, whatsapp, descricao, origem || null]
    );

    return res.status(201).json({
      id: result.insertId,
      message: "Solicitação criada com sucesso.",
    });
  } catch (err) {
    console.error("Erro ao criar solicitação de serviço:", err);
    return res.status(500).json({
      message: "Erro interno ao criar solicitação de serviço.",
    });
  }
});

/**
 * @openapi
 * /api/public/servicos/{id}/view:
 *   post:
 *     tags: [Serviços Públicos]
 *     summary: Incrementa contador de visualização do colaborador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Visualização registrada com sucesso
 *       404:
 *         description: Colaborador não encontrado
 *       500:
 *         description: Erro interno ao registrar visualização
 */

/* =====================================================
   POST /api/public/servicos/:id/view
   Incrementa contador de visualizações no colaborador
===================================================== */
router.post("/:id/view", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT id FROM colaboradores WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    await pool.query(
      `UPDATE colaboradores SET views_count = views_count + 1 WHERE id = ?`,
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao incrementar visualização:", err);
    return res.status(500).json({
      message: "Erro ao registrar visualização do colaborador.",
    });
  }
});

/**
 * @openapi
 * /api/public/servicos/{id}/whatsapp:
 *   post:
 *     tags: [Serviços Públicos]
 *     summary: Incrementa contador de cliques no WhatsApp do colaborador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Clique no WhatsApp registrado com sucesso
 *       404:
 *         description: Colaborador não encontrado
 *       500:
 *         description: Erro interno ao registrar clique no WhatsApp
 */

/* =====================================================
   POST /api/public/servicos/:id/whatsapp
   Incrementa contador de cliques no WhatsApp
===================================================== */
router.post("/:id/whatsapp", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT id FROM colaboradores WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    await pool.query(
      `UPDATE colaboradores SET whatsapp_clicks = whatsapp_clicks + 1 WHERE id = ?`,
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao incrementar clique WhatsApp:", err);
    return res.status(500).json({
      message: "Erro ao registrar clique no WhatsApp.",
    });
  }
});

// POST /api/public/trabalhe-conosco
// Cadastra interesse de prestador como colaborador NÃO verificado
// =====================================================
router.post("/trabalhe-conosco", async (req, res) => {
  const { nome, whatsapp, cargo, descricao, especialidade_id } = req.body || {};

  if (!nome || !whatsapp) {
    return res
      .status(400)
      .json({ message: "Campos obrigatórios: nome e WhatsApp." });
  }

  try {
    const [result] = await pool.query(
      `
        INSERT INTO colaboradores
          (nome, cargo, whatsapp, descricao, especialidade_id, verificado, created_at)
        VALUES (?, ?, ?, ?, ?, 0, NOW())
      `,
      [nome, cargo || null, whatsapp, descricao || null, especialidade_id || null]
    );

    return res.status(201).json({
      id: result.insertId,
      message: "Cadastro recebido! Em breve entraremos em contato.",
    });
  } catch (err) {
    console.error("Erro em /trabalhe-conosco:", err);
    return res.status(500).json({ message: "Erro ao receber cadastro." });
  }
});

module.exports = router;
