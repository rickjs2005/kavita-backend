// controllers/corretoraPanel/reviewsCorretoraController.js
//
// Endpoints do painel da corretora para gestão das próprias reviews:
//   - listar (apenas aprovadas, as que são públicas)
//   - responder publicamente (corretora_reply)
//
// Todas as rotas ficam sob verifyCorretora + validateCSRF via mount.
// O controller já age sobre `req.corretoraUser.corretora_id` — não há
// forma de uma corretora tocar reviews de outra.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const reviewsRepo = require("../../repositories/corretoraReviewsRepository");

/** GET /api/corretora/reviews */
async function listMine(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const items = await reviewsRepo.listForCorretora(corretoraId, {
      limit: 50,
    });
    return response.ok(res, items);
  } catch (err) {
    return next(
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
 * PATCH /api/corretora/reviews/:id/reply
 * Body: { reply: string | null }
 *
 * Reply aparece publicamente abaixo da review original. Apenas reviews
 * approved da mesma corretora podem receber reply — enforce no repo
 * com guard (corretora_id + status='approved').
 */
async function replyToReview(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const affected = await reviewsRepo.setReply({
      id,
      corretora_id: req.corretoraUser.corretora_id,
      user_id: req.corretoraUser.id,
      reply: req.body?.reply ?? null,
    });
    if (affected === 0) {
      // 0 rows = review não existe OU pertence a outra corretora OU
      // não está approved. 404 genérico evita leak de qual caso é.
      throw new AppError(
        "Avaliação não encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    return response.ok(
      res,
      null,
      req.body?.reply?.trim()
        ? "Resposta publicada."
        : "Resposta removida.",
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao responder avaliação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { listMine, replyToReview };
