// controllers/newsPublicController.js
// Público: endpoints consumidos pelo site (sem login)

const climaRepo = require("../repositories/climaRepository");
const cotacoesRepo = require("../repositories/cotacoesRepository");
const postsRepo = require("../repositories/postsRepository");
const {
  toInt, normalizeSlug, isValidSlug, sanitizeLimitOffset,
} = require("../services/news/newsHelpers");
const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/* =========================================================
 * PUBLIC - CLIMA
 * ========================================================= */

const listClima = async (req, res, next) => {
  try {
    const rows = await climaRepo.listClimaPublic();
    return response.ok(res, Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error("newsPublicController.listClima:", error);
    return next(new AppError("Erro ao listar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getClima = async (req, res, next) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return next(new AppError("Slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const clima = await climaRepo.getClimaPublicBySlug(slug);
    if (!clima) return next(new AppError("Clima não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    return response.ok(res, clima);
  } catch (error) {
    console.error("newsPublicController.getClima:", error);
    return next(new AppError("Erro ao buscar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/* =========================================================
 * PUBLIC - COTAÇÕES
 * ========================================================= */

const listCotacoes = async (req, res, next) => {
  try {
    const group_key = req.query.group_key ? String(req.query.group_key).trim() : null;
    const rows = await cotacoesRepo.listCotacoesPublic({ group_key });
    return response.ok(res, Array.isArray(rows) ? rows : [], null, group_key ? { group_key } : undefined);
  } catch (error) {
    console.error("newsPublicController.listCotacoes:", error);
    return next(new AppError("Erro ao listar cotações.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getCotacao = async (req, res, next) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return next(new AppError("Slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const cotacao = await cotacoesRepo.getCotacaoPublicBySlug(slug);
    if (!cotacao) return next(new AppError("Cotação não encontrada.", ERROR_CODES.NOT_FOUND, 404));
    return response.ok(res, cotacao);
  } catch (error) {
    console.error("newsPublicController.getCotacao:", error);
    return next(new AppError("Erro ao buscar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getCotacaoHistory = async (req, res, next) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return next(new AppError("Slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const cotacao = await cotacoesRepo.getCotacaoPublicBySlug(slug);
    if (!cotacao) return next(new AppError("Cotação não encontrada.", ERROR_CODES.NOT_FOUND, 404));

    const limit = Math.min(Math.max(toInt(req.query.limit, 10), 1), 50);
    const rows = await cotacoesRepo.listCotacaoHistoryPublic(cotacao.id, limit);
    return response.ok(res, Array.isArray(rows) ? rows : [], null, { slug, limit });
  } catch (error) {
    console.error("newsPublicController.getCotacaoHistory:", error);
    return next(new AppError("Erro ao buscar histórico.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/* =========================================================
 * PUBLIC - POSTS
 * ========================================================= */

const listPosts = async (req, res, next) => {
  const { lim: limit, off: offset } = sanitizeLimitOffset(req.query.limit, req.query.offset, 50);
  try {
    const posts = await postsRepo.listPostsPublic({ limit, offset });
    return response.ok(res, Array.isArray(posts) ? posts : [], null, { limit, offset });
  } catch (error) {
    console.error("newsPublicController.listPosts:", error);
    return next(new AppError("Erro ao listar posts.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getPost = async (req, res, next) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug || !isValidSlug(slug)) {
    return next(new AppError("Slug inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const post = await postsRepo.getPostPublicBySlug(slug);
    if (!post) return next(new AppError("Post não encontrado (ou não publicado).", ERROR_CODES.NOT_FOUND, 404));

    // incrementa views (best-effort — falha silenciosa)
    try {
      await postsRepo.incrementPostViews(slug);
    } catch {
      // não derruba a request
    }

    return response.ok(res, post);
  } catch (error) {
    console.error("newsPublicController.getPost:", error);
    return next(new AppError("Erro ao buscar post.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/* =========================================================
 * PUBLIC - OVERVIEW (HOME)
 * ========================================================= */

const overview = async (req, res, next) => {
  try {
    const postsLimit = Math.min(Math.max(toInt(req.query.posts_limit, 6), 1), 20);

    const [clima, cotacoes, posts] = await Promise.all([
      climaRepo.listClimaPublic(),
      cotacoesRepo.listCotacoesPublic({ group_key: null }),
      postsRepo.listPostsPublic({ limit: postsLimit, offset: 0 }),
    ]);

    return response.ok(res, {
      clima: Array.isArray(clima) ? clima : [],
      cotacoes: Array.isArray(cotacoes) ? cotacoes : [],
      posts: Array.isArray(posts) ? posts : [],
    });
  } catch (error) {
    console.error("newsPublicController.overview:", error);
    return next(new AppError("Erro ao carregar overview.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { listClima, getClima, listCotacoes, getCotacao, getCotacaoHistory, listPosts, getPost, overview };
