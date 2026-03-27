// controllers/news/adminPostsController.js
// Admin controller do Kavita News - POSTS (CRUD + listagem paginada)

const postsRepo = require("../../repositories/postsRepository");
const { sanitizeText, sanitizeRichText } = require("../../utils/sanitize");
const { logAdminAction } = require("../../services/adminLogs");
const {
  ok, created, fail,
  toInt, isNonEmptyStr, isOptionalStr, isValidDateTimeLike,
  normalizeSlug, isValidSlug, nowSql,
} = require("../../services/news/helpers");
const ERROR_CODES = require("../../constants/ErrorCodes");

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

/* helper local: extrai adminId do req e delega para o serviço centralizado */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  await logAdminAction({ adminId: getAdminId(req), acao, entidade, entidadeId: entidade_id });
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

    const total = await postsRepo.countPosts(whereSql, params);
    const rows = await postsRepo.listPosts(whereSql, params, limit, offset);

    return ok(res, rows, { status, search, limit, offset, total });
  } catch (error) {
    console.error("adminPostsController.listPosts:", error);
    return fail(res, 500, ERROR_CODES.SERVER_ERROR, "Erro ao listar posts.");
  }
}

/* =========================
 * CREATE
 * ========================= */
async function createPost(req, res) {
  try {
    const body = req.body || {};

    const rawTitle = isNonEmptyStr(body.title, 220) ? body.title.trim() : null;
    if (!rawTitle) return fail(res, 400, "VALIDATION_ERROR", "title é obrigatório (máx 220).", { field: "title" });
    const title = sanitizeText(rawTitle, 220);

    // content é NOT NULL no schema — sanitiza rich text para remover XSS
    const rawContent = body.content !== undefined && body.content !== null ? String(body.content) : "";
    if (!rawContent.trim()) {
      return fail(res, 400, "VALIDATION_ERROR", "content é obrigatório.", { field: "content" });
    }
    const content = sanitizeRichText(rawContent);

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
    return created(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.createPost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }
    return fail(res, 500, ERROR_CODES.SERVER_ERROR, "Erro ao criar post.");
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
      params.push(body.title ? sanitizeText(String(body.title).trim(), 220) : null);
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
        if (await postsRepo.slugExistsExcept(slug, id)) {
          return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug. Escolha outro slug.", { field: "slug", slug });
        }

        sets.push("slug = ?");
        params.push(slug);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "excerpt")) {
      if (!isOptionalStr(body.excerpt, 500)) return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 500).", { field: "excerpt" });
      sets.push("excerpt = ?");
      params.push(body.excerpt ? sanitizeText(String(body.excerpt).trim(), 500) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
      const c = body.content !== undefined && body.content !== null ? String(body.content) : "";
      if (!c.trim()) return fail(res, 400, "VALIDATION_ERROR", "content não pode ser vazio.", { field: "content" });
      sets.push("content = ?");
      params.push(sanitizeRichText(c));
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
      params.push(body.category ? sanitizeText(String(body.category).trim(), 80) : null);
    }

    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      if (!isOptionalStr(body.tags, 500)) return fail(res, 400, "VALIDATION_ERROR", "tags inválido (máx 500).", { field: "tags" });
      sets.push("tags = ?");
      params.push(body.tags ? sanitizeText(String(body.tags).trim(), 500) : null);
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

    const affected = await postsRepo.updatePost(id, sets, params);
    if (!affected) {
      return fail(res, 404, "NOT_FOUND", "Post não encontrado.");
    }

    await logAdmin(req, "editou", "news_posts", id);

    const row = await postsRepo.findPostById(id);
    return ok(res, row || { id });
  } catch (error) {
    console.error("adminPostsController.updatePost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }
    return fail(res, 500, ERROR_CODES.SERVER_ERROR, "Erro ao atualizar post.");
  }
}

/* =========================
 * DELETE
 * ========================= */
async function deletePost(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const affected = await postsRepo.deletePost(id);
    if (!affected) {
      return fail(res, 404, "NOT_FOUND", "Post não encontrado.");
    }

    await logAdmin(req, "removeu", "news_posts", id);
    return ok(res, { deleted: true, id });
  } catch (error) {
    console.error("adminPostsController.deletePost:", error);
    return fail(res, 500, ERROR_CODES.SERVER_ERROR, "Erro ao remover post.");
  }
}

module.exports = {
  listPosts,
  createPost,
  updatePost,
  deletePost,
};
