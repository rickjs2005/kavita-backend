// controllers/corretoraPanel/analyticsCorretoraController.js
//
// GET /api/corretora/analytics?range=7d|30d|90d
//
// Dashboard analytic do painel. Todos os números são da própria
// corretora (enforce via req.corretoraUser.corretora_id). Comparativo
// regional é agregado anônimo da cidade — sem IDs ou nomes de outras
// corretoras no payload.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const analyticsService = require("../../services/corretoraPanelAnalyticsService");

async function getDashboard(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const range = String(req.query.range || "30d");
    const data = await analyticsService.getDashboard(corretoraId, range);
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar analytics.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { getDashboard };
