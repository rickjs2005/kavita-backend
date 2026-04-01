// controllers/news/adminPostsController.js
// Admin controller do Kavita News - POSTS (CRUD + listagem paginada)

const postsRepo = require("../../repositories/postsRepository");
const { sanitizeText, sanitizeRichText } = require("../../utils/sanitize");
const { logAdminAction } = require("../../services/adminLogs");
const {
  toInt, isValidDateTimeLike,
  normalizeSlug, isValidSlug, nowSql, sanitizeLimitOffset,
} = require("../../services/news/newsHelpers");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

async function logAdmin(req, acao, entidade, entidade_id = null) {
  await logAdminAction({ adminId: getAdminId(req), acao, entidade, entidadeId: entidade_id });
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
  return postsRepo.slugExists(slug);
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
async function listPosts(req, res, next) {
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
      return next(new AppError(
        "status inválido (draft|published|archived).",
        ERROR_CODES.VALIDATION_ERROR, 400,
        { fields: [{ field: "status", message: "status inválido (draft|published|archived)." }] }
      ));
    }

    const booleanSearch = normalizeSearchToBooleanMode(search);
    if (booleanSearch) {
      where.push("(MATCH(title, excerpt, content) AGAINST (? IN BOOLEAN MODE))");
      params.push(booleanSearch);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = await postsRepo.countPosts(whereSql, params);
    const rows = await postsRepo.listPosts(whereSql, params, limit, offset);

    return response.ok(res, rows, null, { status, search, limit, offset, total });
  } catch (error) {
    console.error("adminPostsController.listPosts:", error);
    return next(new AppError("Erro ao listar posts.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/* =========================
 * CREATE — body pre-validated by CreatePostSchema
 * ========================= */
async function createPost(req, res, next) {
  try {
    const body = req.body || {};

    // title and content min/max already validated by Zod
    const title = sanitizeText(String(body.title).trim(), 220);

    // Zod ensures content.length >= 1, but whitespace-only is also invalid
    const rawContent = String(body.content);
    if (!rawContent.trim()) {
      return next(new AppError("content não pode ser apenas espaço.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: [{ field: "content", message: "content não pode ser apenas espaço." }],
      }));
    }
    const content = sanitizeRichText(rawContent);

    // slug: optional — if provided, validate and check uniqueness; if not, generate from title
    const userProvidedSlug = body.slug !== undefined && body.slug !== null && body.slug !== "";
    let slug = null;

    if (userProvidedSlug) {
      slug = normalizeSlug(body.slug);
      if (!isValidSlug(slug)) {
        return next(new AppError("slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
          fields: [{ field: "slug", message: "slug inválido." }],
        }));
      }
      // Slug fornecido manualmente e já existe → 409 explícito
      if (await slugExists(slug)) {
        return next(new AppError("Já existe um post com esse slug. Escolha outro slug.", ERROR_CODES.CONFLICT, 409));
      }
    } else {
      const base = slugifyFromTitle(title);
      if (base && base.length <= 240 && isValidSlug(base)) {
        slug = await ensureUniqueSlugAuto(base);
        if (slug && slug.length > 240) slug = slug.slice(0, 240);
      } else {
        // título vira slug vazio após slugify (ex: só emoji) — NULL (unique permite múltiplos NULL)
        slug = null;
      }
    }

    const status = String(body.status || "draft");

    let published_at = null;
    if (body.published_at !== undefined && body.published_at !== null && body.published_at !== "") {
      if (!isValidDateTimeLike(body.published_at)) {
        return next(new AppError("published_at inválido (YYYY-MM-DD HH:mm:ss).", ERROR_CODES.VALIDATION_ERROR, 400, {
          fields: [{ field: "published_at", message: "published_at inválido (YYYY-MM-DD HH:mm:ss)." }],
        }));
      }
      published_at = String(body.published_at).replace("T", " ");
      if (/^\d{4}-\d{2}-\d{2}$/.test(published_at)) published_at = `${published_at} 00:00:00`;
    } else if (status === "published") {
      published_at = nowSql();
    }

    const author_admin_id = getAdminId(req);

    const excerpt = body.excerpt ? sanitizeText(String(body.excerpt), 500) : null;
    const cover_image_url = body.cover_image_url ? String(body.cover_image_url).trim() : null;
    const category = body.category ? sanitizeText(String(body.category), 80) : null;
    const tags = body.tags ? sanitizeText(String(body.tags), 500) : null;

    const id = await postsRepo.insertPost(
      title, slug, excerpt, content, cover_image_url,
      category, tags, status, published_at, author_admin_id
    );
    await logAdmin(req, "criou", "news_posts", id);

    const row = await postsRepo.findPostById(id);
    return response.created(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.createPost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return next(new AppError("Já existe um post com esse slug.", ERROR_CODES.CONFLICT, 409));
    }
    return next(new AppError("Erro ao criar post.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/* =========================
 * UPDATE — params pre-validated by PostIdParamSchema, body by UpdatePostSchema
 * ========================= */
async function updatePost(req, res, next) {
  try {
    const id = req.params.id; // number, coerced by PostIdParamSchema

    const body = req.body || {};

    const sets = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      sets.push("title = ?");
      params.push(body.title ? sanitizeText(String(body.title).trim(), 220) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      if (body.slug === null || body.slug === "") {
        sets.push("slug = ?");
        params.push(null);
      } else {
        const slug = normalizeSlug(body.slug);
        if (!isValidSlug(slug)) {
          return next(new AppError("slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400, {
            fields: [{ field: "slug", message: "slug inválido." }],
          }));
        }
        if (await postsRepo.slugExistsExcept(slug, id)) {
          return next(new AppError("Já existe um post com esse slug. Escolha outro slug.", ERROR_CODES.CONFLICT, 409));
        }
        sets.push("slug = ?");
        params.push(slug);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "excerpt")) {
      sets.push("excerpt = ?");
      params.push(body.excerpt ? sanitizeText(String(body.excerpt).trim(), 500) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
      const c = String(body.content ?? "");
      if (!c.trim()) {
        return next(new AppError("content não pode ser vazio.", ERROR_CODES.VALIDATION_ERROR, 400, {
          fields: [{ field: "content", message: "content não pode ser vazio." }],
        }));
      }
      sets.push("content = ?");
      params.push(sanitizeRichText(c));
    }

    if (Object.prototype.hasOwnProperty.call(body, "cover_image_url")) {
      sets.push("cover_image_url = ?");
      params.push(body.cover_image_url ? String(body.cover_image_url).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      sets.push("category = ?");
      params.push(body.category ? sanitizeText(String(body.category).trim(), 80) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      sets.push("tags = ?");
      params.push(body.tags ? sanitizeText(String(body.tags).trim(), 500) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = String(body.status).trim();
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
          return next(new AppError("published_at inválido (YYYY-MM-DD HH:mm:ss).", ERROR_CODES.VALIDATION_ERROR, 400, {
            fields: [{ field: "published_at", message: "published_at inválido (YYYY-MM-DD HH:mm:ss)." }],
          }));
        }
        let dt = String(body.published_at).replace("T", " ");
        if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) dt = `${dt} 00:00:00`;
        sets.push("published_at = ?");
        params.push(dt);
      }
    }

    if (sets.length === 0) {
      return next(new AppError("Nenhum campo para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const affected = await postsRepo.updatePost(id, sets, params);
    if (!affected) {
      return next(new AppError("Post não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    await logAdmin(req, "editou", "news_posts", id);

    const row = await postsRepo.findPostById(id);
    return response.ok(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.updatePost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return next(new AppError("Já existe um post com esse slug.", ERROR_CODES.CONFLICT, 409));
    }
    return next(new AppError("Erro ao atualizar post.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/* =========================
 * DELETE — params pre-validated by PostIdParamSchema
 * ========================= */
async function deletePost(req, res, next) {
  try {
    const id = req.params.id; // number, coerced by PostIdParamSchema

    const affected = await postsRepo.deletePost(id);
    if (!affected) {
      return next(new AppError("Post não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    await logAdmin(req, "removeu", "news_posts", id);
    return response.ok(res, { deleted: true, id });
  } catch (error) {
    console.error("adminPostsController.deletePost:", error);
    return next(new AppError("Erro ao remover post.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = {
  listPosts,
  createPost,
  updatePost,
  deletePost,
};
