// controllers/corretoraReviewsAdminController.js
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const reviewsService = require("../services/corretoraReviewsService");
const reviewsRepo = require("../repositories/corretoraReviewsRepository");

/**
 * GET /api/admin/mercado-do-cafe/reviews
 */
async function listReviews(req, res, next) {
  try {
    const { status, corretora_id, page, limit } = req.query;
    const result = await reviewsRepo.listAdmin({
      status,
      corretora_id,
      page,
      limit,
    });
    response.ok(res, result.items, null, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar avaliações.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/reviews/pending-count
 * Usado no header da tab de moderação (badge).
 */
async function getPendingCount(_req, res, next) {
  try {
    const total = await reviewsRepo.getPendingCount();
    response.ok(res, { total });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao contar avaliações pendentes.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/admin/mercado-do-cafe/reviews/:id/moderate
 */
async function moderateReview(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const result = await reviewsService.moderateReview({
      id,
      action: req.body.action,
      rejection_reason: req.body.rejection_reason,
      reviewed_by: req.admin?.id ?? null,
    });

    response.ok(res, result, "Avaliação moderada com sucesso.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao moderar avaliação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  listReviews,
  getPendingCount,
  moderateReview,
};
