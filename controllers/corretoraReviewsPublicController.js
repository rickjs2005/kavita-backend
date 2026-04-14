// controllers/corretoraReviewsPublicController.js
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const reviewsService = require("../services/corretoraReviewsService");
const reviewsRepo = require("../repositories/corretoraReviewsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");

/**
 * POST /api/public/corretoras/:slug/reviews
 * Public, rate-limited, Turnstile-protected (middleware no route).
 */
async function submitReview(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      throw new AppError("Slug é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const created = await reviewsService.createReviewFromPublic({
      slug,
      data: req.body,
      meta: {
        ip: req.ip,
        userAgent: req.get?.("user-agent") ?? null,
      },
    });

    response.created(res, created, "Avaliação enviada. Aguardando moderação.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar avaliação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/public/corretoras/:slug/reviews
 * Lista apenas reviews aprovadas + agregado (total, média).
 */
async function listPublicReviews(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    const corretora = await publicCorretorasRepo.findBySlug(slug);
    if (!corretora || corretora.status !== "active") {
      throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }

    const [reviews, aggregate] = await Promise.all([
      reviewsRepo.listPublicByCorretoraId(corretora.id, { limit: 20 }),
      reviewsRepo.getAggregateByCorretoraId(corretora.id),
    ]);

    response.ok(res, { reviews, aggregate });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar avaliações.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { submitReview, listPublicReviews };
