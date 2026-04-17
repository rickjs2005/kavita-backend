// controllers/corretorasPublicController.js
//
// Public endpoints for Mercado do Café / Corretoras.
// No auth required. Read-only + public submission.
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const publicRepo = require("../repositories/corretorasPublicRepository");
const slugHistoryRepo = require("../repositories/corretoraSlugHistoryRepository");
const corretorasService = require("../services/corretorasService");
const mediaService = require("../services/mediaService");
const {
  listPublicQuerySchema,
} = require("../schemas/corretorasSchemas");

/**
 * GET /api/public/corretoras
 */
const listCorretoras = async (req, res, next) => {
  try {
    const qResult = listPublicQuerySchema.safeParse(req.query);
    const q = qResult.success ? qResult.data : { page: 1, limit: 20 };

    const result = await publicRepo.list(q);
    return response.paginated(res, result);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar corretoras.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * GET /api/public/corretoras/cities
 */
const listCities = async (req, res, next) => {
  try {
    const cities = await publicRepo.listCities();
    return response.ok(res, cities);
  } catch (err) {
    return next(new AppError("Erro ao listar cidades.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/**
 * GET /api/public/corretoras/:slug
 *
 * Se o slug não bate com nenhuma corretora ativa, consulta o histórico
 * de slugs (Sprint 3). Encontrando match, devolve 200 com payload
 * mínimo { redirect_to_slug } para o RSC emitir permanentRedirect 301
 * e preservar SEO quando a corretora foi renomeada.
 */
const getBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const corretora = await publicRepo.findBySlug(slug);
    if (corretora) {
      return response.ok(res, corretora);
    }

    const moved = await slugHistoryRepo.resolveRedirect(slug);
    if (moved) {
      return response.ok(res, { redirect_to_slug: moved.current_slug });
    }

    return next(
      new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404),
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar corretora.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * POST /api/public/corretoras/submit
 * Multipart: optional "logo" file field.
 * Body validated by validate(submitCorretoraSchema) middleware.
 */
const submitCorretora = async (req, res, next) => {
  try {
    const data = { ...req.body };

    // Handle logo upload
    if (req.file) {
      const [persisted] = await mediaService.persistMedia([req.file], {
        folder: "corretoras",
      });
      data.logo_path = persisted.path;
    }

    const { id } = await corretorasService.createSubmission(data);

    return response.created(
      res,
      { id },
      "Cadastro enviado com sucesso! Nossa equipe vai analisar sua solicitação."
    );
  } catch (err) {
    // Cleanup uploaded file on error
    if (req.file) {
      mediaService.enqueueOrphanCleanup([req.file]);
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao enviar cadastro.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = {
  listCorretoras,
  listCities,
  getBySlug,
  submitCorretora,
};
