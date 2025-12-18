// controllers/news/adminPostsController.js
// Admin controller do Kavita News - POSTS (CRUD + listagem paginada)

const pool = require("../../config/pool");

/* =========================
 * Helpers: respostas padrão
 * ========================= */
function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta !== undefined) payload.meta = meta;
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

function isNonEmptyStr(v, max = 999999) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function isOptionalStr(v, max) {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && v.trim().length <= max;
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
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

/**
 * Log de auditoria (não derruba a request)
 */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = getAdminId(req);
    if (!admin_id) return;
    await pool.query(
      `INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)`,
      [admin_id, acao, entidade, entidade_id]
    );
  } catch {
    // noop
  }
}

function sanitizeLimitOffset(limit, offset) {
  const lim = Math.min(Math.max(toInt(limit, 10), 1), 100);
  const off = Math.max(toInt(offset, 0), 0);
  return { lim, off };
}

function normalizeSearchToBooleanMode(search) {
  const clean = String(search || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return null;

  return clean
    .split(" ")
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
}

/* =========================
 * Slug: slugify + unicidade
 * ========================= */

// slugify sem libs: remove acentos, troca espaços por "-", limpa caracteres.
function slugifyFromTitle(title) {
  const s = String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s-]/g, " ")   // remove símbolos
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return s;
}

async function slugExists(slug) {
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM news_posts WHERE slug = ? LIMIT 1`,
    [slug]
  );
  return !!row?.ok;
}

// Se slug foi gerado automaticamente, tenta cafe, cafe-2, cafe-3...
async function ensureUniqueSlugAuto(baseSlug) {
  let candidate = baseSlug;
  if (!candidate) return null;

  // limita tentativas para evitar loop infinito
  for (let i = 0; i < 50; i++) {
    const exists = await slugExists(candidate);
    if (!exists) return candidate;
    candidate = `${baseSlug}-${i + 2}`;
  }

  // fallback extremo: timestamp
  return `${baseSlug}-${Date.now()}`;
}

/* =========================
 * LIST
 * ========================= */
async function listPosts(req, res) {
  try {
    const status = req.query.status ? String(req.query.status).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const { lim: limit, off: offset } = sanitizeLimitOffset(req.query.limit, req.query.offset);

    const where = [];
    const params = [];

    if (status && ["draft", "published", "archived"].includes(status)) {
      where.push("status = ?");
      params.push(status);
    } else if (status) {
      return fail(res, 400, "VALIDATION_ERROR", "status inválido (draft|published|archived).", { field: "status" });
    }

    const booleanSearch = normalizeSearchToBooleanMode(search);
    if (booleanSearch) {
      where.push("(MATCH(title, excerpt, content) AGAINST (? IN BOOLEAN MODE))");
      params.push(booleanSearch);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sqlCount = `
      SELECT COUNT(*) AS total
      FROM news_posts
      ${whereSql}
    `;

    const sqlList = `
      SELECT
        id,
        title,
        slug,
        excerpt,
        content,
        cover_image_url,
        category,
        tags,
        status,
        published_at,
        author_admin_id,
        views,
        criado_em,
        atualizado_em
      FROM news_posts
      ${whereSql}
      ORDER BY criado_em DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const [[countRow]] = await pool.query(sqlCount, params);
    const total = Number(countRow?.total || 0);

    const listParams = [...params, limit, offset];
    const [rows] = await pool.query(sqlList, listParams);

    return ok(res, rows, { status, search, limit, offset, total });
  } catch (error) {
    console.error("adminPostsController.listPosts:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar posts.");
  }
}

/* =========================
 * CREATE
 * ========================= */
async function createPost(req, res) {
  try {
    const body = req.body || {};

    const title = isNonEmptyStr(body.title, 220) ? body.title.trim() : null;
    if (!title) return fail(res, 400, "VALIDATION_ERROR", "title é obrigatório (máx 220).", { field: "title" });

    // content é NOT NULL no schema
    const content = body.content !== undefined && body.content !== null ? String(body.content) : "";
    if (!content.trim()) {
      return fail(res, 400, "VALIDATION_ERROR", "content é obrigatório.", { field: "content" });
    }

    // slug opcional: se vier, respeita e valida; se não vier, gera a partir do title e garante unicidade
    const userProvidedSlug = body.slug !== undefined && body.slug !== null && body.slug !== "";
    let slug = null;

    if (userProvidedSlug) {
      slug = normalizeSlug(body.slug);
      if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      if (slug.length > 240) return fail(res, 400, "VALIDATION_ERROR", "slug inválido (máx 240).", { field: "slug" });

      // Se o usuário digitou manualmente e já existe → 409 claro
      if (await slugExists(slug)) {
        return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug. Escolha outro slug.", {
          field: "slug",
          slug,
        });
      }
    } else {
      const base = slugifyFromTitle(title);
      if (base && base.length <= 240 && isValidSlug(base)) {
        slug = await ensureUniqueSlugAuto(base);
        if (slug && slug.length > 240) slug = slug.slice(0, 240);
      } else {
        // se título virar vazio após slugify (ex: só emoji), deixa null (unique permite múltiplos NULL)
        slug = null;
      }
    }

    // campos opcionais conforme schema
    if (!isOptionalStr(body.excerpt, 500)) return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 500).", { field: "excerpt" });
    if (!isOptionalStr(body.cover_image_url, 500)) return fail(res, 400, "VALIDATION_ERROR", "cover_image_url inválido (máx 500).", { field: "cover_image_url" });
    if (!isOptionalStr(body.category, 80)) return fail(res, 400, "VALIDATION_ERROR", "category inválido (máx 80).", { field: "category" });
    if (!isOptionalStr(body.tags, 500)) return fail(res, 400, "VALIDATION_ERROR", "tags inválido (máx 500).", { field: "tags" });

    const status = body.status ? String(body.status).trim() : "draft";
    if (!["draft", "published", "archived"].includes(status)) {
      return fail(res, 400, "VALIDATION_ERROR", "status inválido (draft|published|archived).", { field: "status" });
    }

    let published_at = null;
    if (body.published_at !== undefined && body.published_at !== null && body.published_at !== "") {
      if (!isValidDateTimeLike(body.published_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
      }
      published_at = String(body.published_at).replace("T", " ");
      if (/^\d{4}-\d{2}-\d{2}$/.test(published_at)) published_at = `${published_at} 00:00:00`;
    } else if (status === "published") {
      published_at = nowSql();
    }

    const author_admin_id = getAdminId(req);

    const excerpt = body.excerpt ? String(body.excerpt).trim() : null;
    const cover_image_url = body.cover_image_url ? String(body.cover_image_url).trim() : null;
    const category = body.category ? String(body.category).trim() : null;
    const tags = body.tags ? String(body.tags).trim() : null;

    const sql = `
      INSERT INTO news_posts
        (title, slug, excerpt, content, cover_image_url, category, tags, status, published_at, author_admin_id, views)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    const [result] = await pool.query(sql, [
      title,
      slug,
      excerpt,
      content,
      cover_image_url,
      category,
      tags,
      status,
      published_at,
      author_admin_id,
    ]);

    const id = result?.insertId;
    await logAdmin(req, "criou", "news_posts", id);

    const [[row]] = await pool.query(
      `SELECT
        id, title, slug, excerpt, content, cover_image_url, category, tags, status, published_at,
        author_admin_id, views, criado_em, atualizado_em
       FROM news_posts
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return created(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.createPost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar post.");
  }
}

/* =========================
 * UPDATE
 * ========================= */
async function updatePost(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};

    const sets = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      if (body.title !== null && body.title !== "" && !isNonEmptyStr(body.title, 220)) {
        return fail(res, 400, "VALIDATION_ERROR", "title inválido (máx 220).", { field: "title" });
      }
      sets.push("title = ?");
      params.push(body.title ? String(body.title).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      if (body.slug === null || body.slug === "") {
        sets.push("slug = ?");
        params.push(null);
      } else {
        const slug = normalizeSlug(body.slug);
        if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
        if (slug.length > 240) return fail(res, 400, "VALIDATION_ERROR", "slug inválido (máx 240).", { field: "slug" });

        // opcional: bloquear se já existir em outro post
        const [[row]] = await pool.query(
          `SELECT id FROM news_posts WHERE slug = ? AND id <> ? LIMIT 1`,
          [slug, id]
        );
        if (row?.id) {
          return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug. Escolha outro slug.", { field: "slug", slug });
        }

        sets.push("slug = ?");
        params.push(slug);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "excerpt")) {
      if (!isOptionalStr(body.excerpt, 500)) return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 500).", { field: "excerpt" });
      sets.push("excerpt = ?");
      params.push(body.excerpt ? String(body.excerpt).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
      const c = body.content !== undefined && body.content !== null ? String(body.content) : "";
      if (!c.trim()) return fail(res, 400, "VALIDATION_ERROR", "content não pode ser vazio.", { field: "content" });
      sets.push("content = ?");
      params.push(c);
    }

    if (Object.prototype.hasOwnProperty.call(body, "cover_image_url")) {
      if (!isOptionalStr(body.cover_image_url, 500)) {
        return fail(res, 400, "VALIDATION_ERROR", "cover_image_url inválido (máx 500).", { field: "cover_image_url" });
      }
      sets.push("cover_image_url = ?");
      params.push(body.cover_image_url ? String(body.cover_image_url).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      if (!isOptionalStr(body.category, 80)) return fail(res, 400, "VALIDATION_ERROR", "category inválido (máx 80).", { field: "category" });
      sets.push("category = ?");
      params.push(body.category ? String(body.category).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      if (!isOptionalStr(body.tags, 500)) return fail(res, 400, "VALIDATION_ERROR", "tags inválido (máx 500).", { field: "tags" });
      sets.push("tags = ?");
      params.push(body.tags ? String(body.tags).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = body.status === null || body.status === "" ? null : String(body.status).trim();
      if (status !== null && !["draft", "published", "archived"].includes(status)) {
        return fail(res, 400, "VALIDATION_ERROR", "status inválido (draft|published|archived).", { field: "status" });
      }
      if (status === null) {
        return fail(res, 400, "VALIDATION_ERROR", "status não pode ser null.", { field: "status" });
      }
      sets.push("status = ?");
      params.push(status);

      if (status === "published" && !Object.prototype.hasOwnProperty.call(body, "published_at")) {
        sets.push("published_at = COALESCE(published_at, ?)");
        params.push(nowSql());
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "published_at")) {
      if (body.published_at === null || body.published_at === "") {
        sets.push("published_at = ?");
        params.push(null);
      } else {
        if (!isValidDateTimeLike(body.published_at)) {
          return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
        }
        let dt = String(body.published_at).replace("T", " ");
        if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) dt = `${dt} 00:00:00`;
        sets.push("published_at = ?");
        params.push(dt);
      }
    }

    if (sets.length === 0) {
      return fail(res, 400, "VALIDATION_ERROR", "Nenhum campo para atualizar.");
    }

    const sql = `UPDATE news_posts SET ${sets.join(", ")} WHERE id = ?`;
    params.push(id);

    const [result] = await pool.query(sql, params);
    if (!result || result.affectedRows === 0) {
      return fail(res, 404, "NOT_FOUND", "Post não encontrado.");
    }

    await logAdmin(req, "editou", "news_posts", id);

    const [[row]] = await pool.query(
      `SELECT
        id, title, slug, excerpt, content, cover_image_url, category, tags, status, published_at,
        author_admin_id, views, criado_em, atualizado_em
       FROM news_posts
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return ok(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.updatePost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar post.");
  }
}

/* =========================
 * DELETE
 * ========================= */
async function deletePost(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const [result] = await pool.query(`DELETE FROM news_posts WHERE id = ?`, [id]);
    if (!result || result.affectedRows === 0) {
      return fail(res, 404, "NOT_FOUND", "Post não encontrado.");
    }

    await logAdmin(req, "removeu", "news_posts", id);
    return ok(res, { deleted: true, id });
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
