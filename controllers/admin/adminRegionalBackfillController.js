// controllers/admin/adminRegionalBackfillController.js
//
// ETAPA 3.4 — ferramentas do admin Kavita pra identificar e chamar
// corretoras com perfil regional incompleto a preencher os 6 campos
// novos (endereço + 4 booleans + volume mínimo).
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const adminRepo = require("../../repositories/corretorasAdminRepository");
const mailService = require("../../services/mailService");
const auditService = require("../../services/adminAuditService");
const logger = require("../../lib/logger");

/**
 * GET /api/admin/mercado-do-cafe/backfill-regional
 * Lista corretoras com perfil regional incompleto (ver repo para
 * critério). Retorna contagem + payload pra tabela admin.
 */
async function listIncomplete(_req, res, next) {
  try {
    const corretoras = await adminRepo.listIncompleteRegional();
    return response.ok(res, {
      total: corretoras.length,
      items: corretoras,
    });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar corretoras incompletas.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/admin/mercado-do-cafe/backfill-regional/invite/:id
 * Envia e-mail editorial convidando a corretora a completar o perfil.
 */
async function sendInvite(req, res, next) {
  try {
    const corretoraId = Number(req.params.id);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const corretora = await adminRepo.findById(corretoraId);
    if (!corretora) {
      throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (!corretora.email) {
      throw new AppError(
        "Esta corretora não tem e-mail cadastrado.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    try {
      await mailService.sendRegionalBackfillInviteEmail({
        toEmail: corretora.email,
        corretoraName: corretora.name,
        contactName: corretora.contact_name,
      });
    } catch (err) {
      logger.warn(
        { err, corretoraId },
        "admin.backfill.invite_email_failed",
      );
      throw new AppError(
        "Não foi possível enviar o e-mail agora. Tente em instantes.",
        ERROR_CODES.SERVER_ERROR,
        503,
      );
    }

    auditService.record({
      req,
      action: "corretora.backfill_invite_sent",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { email: corretora.email },
    });

    return response.ok(
      res,
      { sent_to: corretora.email },
      "Convite enviado.",
    );
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar convite.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { listIncomplete, sendInvite };
