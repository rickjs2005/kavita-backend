// controllers/corretorasLeadsPublicController.js
//
// Endpoint público de captura de lead (POST /api/public/corretoras/:slug/leads).
// Sem auth, mas com rate-limit por IP aplicado no nível da rota.
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const leadsService = require("../services/corretoraLeadsService");

/**
 * POST /api/public/corretoras/:slug/leads
 * Body validado por validate(createLeadSchema).
 */
async function submitLead(req, res, next) {
  try {
    const { slug } = req.params;

    const result = await leadsService.createLeadFromPublic({
      slug,
      data: req.body,
      meta: {
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 500) || null,
      },
    });

    return response.created(
      res,
      { id: result.id },
      "Mensagem enviada! A corretora receberá seu contato em instantes."
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar mensagem.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

module.exports = { submitLead };
