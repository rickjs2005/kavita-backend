// controllers/newsPublicController.js
// Público: endpoints consumidos pelo site (sem login)
// Padrão de resposta: { ok, data, meta? }

const newsModel = require("../models/newsModel");
let pool = null;
try {
  pool = require("../config/pool");
} catch {
  pool = null;
}

/* =========================
 * Helpers: respostas padronizadas
 * ========================= */
function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta !== undefined) payload.meta = meta;
  return res.status(200).json(payload);
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

function sanitizeLimitOffset(limit, offset, maxLimit = 50) {
  const lim = Math.min(Math.max(toInt(limit, 10), 1), maxLimit);
  const off = Math.max(toInt(offset, 0), 0);
  return { lim, off };
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/* =========================================================
 * PUBLIC - CLIMA
 * ========================================================= */

// GET /api/news/clima  (lista ativa)
exports.listClima = async (req, res) => {
  try {
    const rows = await newsModel.listClimaPublic?.();
    if (!Array.isArray(rows)) return ok(res, []);
    return ok(res, rows);
  } catch (error) {
    console.error("newsPublicController.listClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar clima.");
  }
};

// GET /api/news/clima/:slug
exports.getClima = async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return fail(res, 400, "VALIDATION_ERROR", "Slug inválido.", { field: "slug" });
  }

  try {
    const clima = await newsModel.getClimaPublicBySlug?.(slug);
    if (!clima) return fail(res, 404, "NOT_FOUND", "Clima não encontrado.");
    return ok(res, clima);
  } catch (error) {
    console.error("newsPublicController.getClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao buscar clima.");
  }
};

/* =========================================================
 * PUBLIC - COTAÇÕES
 * ========================================================= */

// GET /api/news/cotacoes?group_key=graos
exports.listCotacoes = async (req, res) => {
  try {
    const group_key = req.query.group_key ? String(req.query.group_key).trim() : null;
    const rows = await newsModel.listCotacoesPublic?.({ group_key });

    return ok(
      res,
      Array.isArray(rows) ? rows : [],
      group_key ? { group_key } : undefined
    );
  } catch (error) {
    console.error("newsPublicController.listCotacoes:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar cotações.");
  }
};

// GET /api/news/cotacoes/:slug
exports.getCotacao = async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return fail(res, 400, "VALIDATION_ERROR", "Slug inválido.", { field: "slug" });
  }

  try {
    const cotacao = await newsModel.getCotacaoPublicBySlug?.(slug);
    if (!cotacao) return fail(res, 404, "NOT_FOUND", "Cotação não encontrada.");
    return ok(res, cotacao);
  } catch (error) {
    console.error("newsPublicController.getCotacao:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao buscar cotação.");
  }
};

/* =========================================================
 * PUBLIC - POSTS
 * ========================================================= */

// GET /api/news/posts?limit=10&offset=0
exports.listPosts = async (req, res) => {
  const { lim: limit, off: offset } = sanitizeLimitOffset(req.query.limit, req.query.offset, 50);

  try {
    const posts = await newsModel.listPostsPublic?.({ limit, offset });
    return ok(res, Array.isArray(posts) ? posts : [], { limit, offset });
  } catch (error) {
    console.error("newsPublicController.listPosts:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar posts.");
  }
};

// GET /api/news/posts/:slug
// Recomendação: incrementa views (sem quebrar se pool não existir)
exports.getPost = async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return fail(res, 400, "VALIDATION_ERROR", "Slug inválido.", { field: "slug" });
  }

  try {
    // 1) busca post publicado/ativo
    const post = await newsModel.getPostPublicBySlug?.(slug);
    if (!post) return fail(res, 404, "NOT_FOUND", "Post não encontrado (ou não publicado).");

    // 2) incrementa views (best-effort)
    try {
      if (pool) {
        await pool.query(
          `UPDATE news_posts SET views = COALESCE(views, 0) + 1 WHERE slug = ? LIMIT 1`,
          [slug]
        );
      }
    } catch {
      // não derruba a request
    }

    return ok(res, post);
  } catch (error) {
    console.error("newsPublicController.getPost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao buscar post.");
  }
};

/* =========================================================
 * PUBLIC - OVERVIEW (HOME)
 * ========================================================= */

// GET /api/news/overview
// 1 request para homepage: clima + cotacoes + posts
exports.overview = async (req, res) => {
  try {
    const postsLimit = Math.min(Math.max(toInt(req.query.posts_limit, 6), 1), 20);

    const [clima, cotacoes, posts] = await Promise.all([
      newsModel.listClimaPublic?.(),
      newsModel.listCotacoesPublic?.({ group_key: null }),
      newsModel.listPostsPublic?.({ limit: postsLimit, offset: 0 }),
    ]);

    return ok(res, {
      clima: Array.isArray(clima) ? clima : [],
      cotacoes: Array.isArray(cotacoes) ? cotacoes : [],
      posts: Array.isArray(posts) ? posts : [],
    });
  } catch (error) {
    console.error("newsPublicController.overview:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao carregar overview.");
  }
};
