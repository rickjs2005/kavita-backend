// controllers/news/adminPostsController.js
// Admin controller do Kavita News - POSTS (CRUD básico para parar erros)

const newsModel = require("../../models/newsModel");
const pool = require("../../config/pool");

/* =========================
 * Swagger (OpenAPI)
 * ========================= */
/**
 * @swagger
 * tags:
 *   - name: Admin News - Posts
 *     description: CRUD de posts do Kavita News (Admin)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminOkResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         data:
 *           nullable: true
 *         meta:
 *           nullable: true
 *     AdminErrorResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: false
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: title é obrigatório (máx 200).
 *         details:
 *           nullable: true
 *     NewsPost:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 123
 *         title:
 *           type: string
 *           example: "Café sobe com clima seco"
 *         slug:
 *           type: string
 *           nullable: true
 *           example: "cafe-sobe-com-clima-seco"
 *         excerpt:
 *           type: string
 *           nullable: true
 *           example: "Resumo curto do post..."
 *         content:
 *           type: string
 *           nullable: true
 *           example: "<p>Conteúdo longo...</p>"
 *         cover_image_url:
 *           type: string
 *           nullable: true
 *           example: "https://site.com/imagem.jpg"
 *         category:
 *           type: string
 *           nullable: true
 *           example: "café"
 *         tags:
 *           type: string
 *           nullable: true
 *           description: CSV (ex: "milho,soja,dolar")
 *           example: "cafe,clima,mercado"
 *         status:
 *           type: string
 *           enum: [draft, published]
 *           example: "published"
 *         published_at:
 *           type: string
 *           nullable: true
 *           description: "YYYY-MM-DD HH:mm:ss"
 *           example: "2025-12-18 10:00:00"
 *         author_admin_id:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         ativo:
 *           type: integer
 *           enum: [0, 1]
 *           example: 1
 *         criado_em:
 *           type: string
 *           nullable: true
 *           example: "2025-12-18 10:00:00"
 *         atualizado_em:
 *           type: string
 *           nullable: true
 *           example: "2025-12-18 10:05:00"
 *     NewsPostCreateInput:
 *       type: object
 *       required:
 *         - title
 *       properties:
 *         title:
 *           type: string
 *           maxLength: 200
 *           example: "Café sobe com clima seco"
 *         slug:
 *           type: string
 *           nullable: true
 *           maxLength: 220
 *           example: "cafe-sobe-com-clima-seco"
 *         excerpt:
 *           type: string
 *           nullable: true
 *           maxLength: 1000
 *           example: "Resumo curto do post..."
 *         content:
 *           type: string
 *           nullable: true
 *           example: "<p>Conteúdo...</p>"
 *         cover_image_url:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *           example: "https://site.com/imagem.jpg"
 *         category:
 *           type: string
 *           nullable: true
 *           maxLength: 120
 *           example: "café"
 *         tags:
 *           type: string
 *           nullable: true
 *           maxLength: 255
 *           description: CSV (ex: "milho,soja,dolar")
 *           example: "cafe,clima,mercado"
 *         status:
 *           type: string
 *           enum: [draft, published]
 *           example: "draft"
 *         published_at:
 *           type: string
 *           nullable: true
 *           description: "YYYY-MM-DD HH:mm:ss"
 *           example: "2025-12-18 10:00:00"
 *         ativo:
 *           type: integer
 *           enum: [0, 1]
 *           example: 1
 *     NewsPostUpdateInput:
 *       type: object
 *       description: "Patch parcial: envie só os campos que deseja alterar"
 *       properties:
 *         title:
 *           type: string
 *           nullable: true
 *           maxLength: 200
 *         slug:
 *           type: string
 *           nullable: true
 *           maxLength: 220
 *         excerpt:
 *           type: string
 *           nullable: true
 *           maxLength: 1000
 *         content:
 *           type: string
 *           nullable: true
 *         cover_image_url:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *         category:
 *           type: string
 *           nullable: true
 *           maxLength: 120
 *         tags:
 *           type: string
 *           nullable: true
 *           maxLength: 255
 *         status:
 *           type: string
 *           nullable: true
 *           enum: [draft, published]
 *         published_at:
 *           type: string
 *           nullable: true
 *           description: "YYYY-MM-DD HH:mm:ss"
 *         ativo:
 *           type: integer
 *           enum: [0, 1]
 *
 * securitySchemes:
 *   cookieAuth:
 *     type: apiKey
 *     in: cookie
 *     name: adminToken
 */

/* =========================
 * Helpers: respostas padrão
 * ========================= */
function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta) payload.meta = meta;
  return res.status(200).json(payload);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

function fail(res, status, code, message, details) {
  const payload = { ok: false, code, message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

function toInt(v, def = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? def : n;
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isNonEmptyStr(v, max = 999999) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function isOptionalStr(v, max) {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && v.trim().length <= max;
}

function toBoolTiny(v, def = 1) {
  if (v === null || v === undefined || v === "") return def;
  if (v === true) return 1;
  if (v === false) return 0;

  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "sim" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "nao" || s === "não" || s === "no") return 0;

  const n = toInt(v, def);
  return n ? 1 : 0;
}

function isValidDateTimeLike(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s);
}

function nowSql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = getAdminId(req);
    if (!admin_id) return;

    await pool.query(
      `INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)`,
      [admin_id, acao, entidade, entidade_id]
    );
  } catch {
    // nunca derruba request
  }
}

/* =========================
 * Handlers - POSTS
 * ========================= */

/**
 * @swagger
 * /api/admin/news/posts:
 *   get:
 *     tags: [Admin News - Posts]
 *     summary: Lista posts (Admin)
 *     description: Lista posts com filtros por status e busca textual.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published]
 *         description: Filtra por status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca em título/trecho (dependendo do model)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *         description: Quantidade de itens
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           example: 0
 *         description: Offset de paginação
 *     responses:
 *       200:
 *         description: Lista retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminOkResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/NewsPost'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         status: { type: string, nullable: true }
 *                         search: { type: string, nullable: true }
 *                         limit:  { type: integer }
 *                         offset: { type: integer }
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       403:
 *         description: Sem permissão
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 */
/**
 * GET /api/admin/news/posts?status=draft|published&search=...&limit=20&offset=0
 */
async function listPosts(req, res) {
  try {
    const status = req.query.status ? String(req.query.status).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const limit = req.query.limit !== undefined ? toInt(req.query.limit, 20) : 20;
    const offset = req.query.offset !== undefined ? toInt(req.query.offset, 0) : 0;

    const rows = await newsModel.listPosts({ status, search, limit, offset });
    return ok(res, rows, { status, search, limit, offset });
  } catch (error) {
    console.error("adminPostsController.listPosts:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar posts.");
  }
}

/**
 * @swagger
 * /api/admin/news/posts:
 *   post:
 *     tags: [Admin News - Posts]
 *     summary: Cria post (Admin)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NewsPostCreateInput' }
 *     responses:
 *       201:
 *         description: Post criado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminOkResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/NewsPost'
 *       400:
 *         description: Erro de validação
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       403:
 *         description: Sem permissão
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       409:
 *         description: Conflito (slug duplicado)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 */
/**
 * POST /api/admin/news/posts
 */
async function createPost(req, res) {
  try {
    const body = req.body || {};

    const title = isNonEmptyStr(body.title, 200) ? body.title.trim() : null;
    const slug = normalizeSlug(body.slug);

    if (!title) return fail(res, 400, "VALIDATION_ERROR", "title é obrigatório (máx 200).", { field: "title" });

    if (body.slug !== undefined && body.slug !== null && body.slug !== "") {
      if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    }

    if (body.excerpt !== undefined && body.excerpt !== null && body.excerpt !== "" && !isOptionalStr(body.excerpt, 1000)) {
      return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 1000).", { field: "excerpt" });
    }

    if (body.cover_image_url !== undefined && body.cover_image_url !== null && body.cover_image_url !== "" && !isOptionalStr(body.cover_image_url, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "cover_image_url inválido (máx 500).", { field: "cover_image_url" });
    }

    if (body.category !== undefined && body.category !== null && body.category !== "" && !isOptionalStr(body.category, 120)) {
      return fail(res, 400, "VALIDATION_ERROR", "category inválido (máx 120).", { field: "category" });
    }

    if (body.tags !== undefined && body.tags !== null && body.tags !== "" && !isOptionalStr(body.tags, 255)) {
      return fail(res, 400, "VALIDATION_ERROR", "tags inválido (máx 255).", { field: "tags" });
    }

    const status = body.status ? String(body.status).trim() : "draft";
    if (status !== "draft" && status !== "published") {
      return fail(res, 400, "VALIDATION_ERROR", "status inválido (draft|published).", { field: "status" });
    }

    if (body.published_at !== undefined && body.published_at !== null && body.published_at !== "" && !isValidDateTimeLike(body.published_at)) {
      return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
    }

    const payload = {
      title,
      slug: body.slug ? slug : null,
      excerpt: body.excerpt ? String(body.excerpt).trim() : null,
      content: body.content ? String(body.content) : null,
      cover_image_url: body.cover_image_url ? String(body.cover_image_url).trim() : null,
      category: body.category ? String(body.category).trim() : null,
      tags: body.tags ? String(body.tags).trim() : null,
      status,
      published_at: body.published_at ?? (status === "published" ? nowSql() : null),
      author_admin_id: getAdminId(req),
      ativo: toBoolTiny(body.ativo, 1),
    };

    const row = await newsModel.createPost(payload);
    await logAdmin(req, "criou", "news_posts", row?.id ?? null);
    return created(res, row);
  } catch (error) {
    console.error("adminPostsController.createPost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar post.");
  }
}

/**
 * @swagger
 * /api/admin/news/posts/{id}:
 *   put:
 *     tags: [Admin News - Posts]
 *     summary: Atualiza post (Admin)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID do post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NewsPostUpdateInput' }
 *     responses:
 *       200:
 *         description: Post atualizado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminOkResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       nullable: true
 *       400:
 *         description: Erro de validação
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       403:
 *         description: Sem permissão
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       409:
 *         description: Conflito (slug duplicado)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 */
/**
 * PUT /api/admin/news/posts/:id
 */
async function updatePost(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      if (body.title !== null && body.title !== "" && !isNonEmptyStr(body.title, 200)) {
        return fail(res, 400, "VALIDATION_ERROR", "title inválido (máx 200).", { field: "title" });
      }
      patch.title = body.title ? String(body.title).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug)) {
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      }
      patch.slug = body.slug ? slug : null;
    }

    for (const f of ["excerpt", "cover_image_url", "category", "tags"]) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        const max = f === "excerpt" ? 1000 : f === "cover_image_url" ? 500 : f === "tags" ? 255 : 120;
        if (body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], max)) {
          return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx ${max}).`, { field: f });
        }
        patch[f] = body[f] ? String(body[f]).trim() : null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
      patch.content = body.content !== undefined ? String(body.content) : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = body.status ? String(body.status).trim() : null;
      if (status !== null && status !== "draft" && status !== "published") {
        return fail(res, 400, "VALIDATION_ERROR", "status inválido (draft|published).", { field: "status" });
      }
      patch.status = status;
    }

    if (Object.prototype.hasOwnProperty.call(body, "published_at")) {
      if (body.published_at !== null && body.published_at !== "" && !isValidDateTimeLike(body.published_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
      }
      patch.published_at = body.published_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ativo")) {
      patch.ativo = toBoolTiny(body.ativo, 1);
    }

    const result = await newsModel.updatePost(id, patch);
    await logAdmin(req, "editou", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminPostsController.updatePost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar post.");
  }
}

/**
 * @swagger
 * /api/admin/news/posts/{id}:
 *   delete:
 *     tags: [Admin News - Posts]
 *     summary: Remove post (Admin)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID do post
 *     responses:
 *       200:
 *         description: Post removido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminOkResponse' }
 *       400:
 *         description: Erro de validação
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       403:
 *         description: Sem permissão
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminErrorResponse' }
 */
/**
 * DELETE /api/admin/news/posts/:id
 */
async function deletePost(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const result = await newsModel.deletePost(id);
    await logAdmin(req, "removeu", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminPostsController.deletePost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover post.");
  }
}

module.exports = {
  listPosts,
  createPost,
  updatePost,
  deletePost,
};
