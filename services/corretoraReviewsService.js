// services/corretoraReviewsService.js
//
// Regras de negócio de reviews: criação pública com moderação e
// aprovação/rejeição pelo admin.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const reviewsRepo = require("../repositories/corretoraReviewsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const analyticsService = require("./analyticsService");
const logger = require("../lib/logger");

async function createReviewFromPublic({ slug, data, meta }) {
  const corretora = await publicCorretorasRepo.findBySlug(slug);
  if (!corretora) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (corretora.status !== "active") {
    throw new AppError(
      "Esta corretora não está recebendo avaliações.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const reviewId = await reviewsRepo.create({
    corretora_id: corretora.id,
    lead_id: data.lead_id ?? null,
    nome_autor: data.nome_autor,
    cidade_autor: data.cidade_autor,
    rating: data.rating,
    comentario: data.comentario,
    source_ip: meta?.ip,
    user_agent: meta?.userAgent,
  });

  logger.info(
    {
      reviewId,
      corretoraId: corretora.id,
      corretoraSlug: slug,
      rating: data.rating,
      ip: meta?.ip,
    },
    "corretora.review.created",
  );

  analyticsService.track({
    name: "review_created",
    actorType: "anonymous",
    corretoraId: corretora.id,
    props: {
      review_id: reviewId,
      rating: data.rating,
      has_comentario: Boolean(data.comentario),
      verified_lead: Boolean(data.lead_id),
    },
    req: {
      ip: meta?.ip,
      get: (h) => (h === "user-agent" ? meta?.userAgent : null),
    },
  });

  return { id: reviewId, corretora_id: corretora.id };
}

async function moderateReview({ id, action, reviewed_by, rejection_reason }) {
  const review = await reviewsRepo.findById(id);
  if (!review) {
    throw new AppError("Review não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (review.status !== "pending") {
    throw new AppError(
      `Review já foi ${review.status === "approved" ? "aprovada" : "rejeitada"}.`,
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const status = action === "approve" ? "approved" : "rejected";
  const affected = await reviewsRepo.moderate({
    id,
    status,
    reviewed_by,
    rejection_reason: action === "reject" ? rejection_reason : null,
  });

  if (affected === 0) {
    throw new AppError("Nada para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  logger.info(
    {
      reviewId: id,
      corretoraId: review.corretora_id,
      action,
      reviewedBy: reviewed_by,
    },
    "corretora.review.moderated",
  );

  analyticsService.track({
    name: "review_moderated",
    actorType: "admin",
    actorId: reviewed_by,
    corretoraId: review.corretora_id,
    props: {
      review_id: id,
      action,
      original_rating: review.rating,
    },
  });

  return reviewsRepo.findById(id);
}

module.exports = {
  createReviewFromPublic,
  moderateReview,
};
