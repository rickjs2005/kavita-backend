// controllers/corretoraRegionalStatsController.js
//
// Admin dashboard regional — Sprint 3. Endpoints read-only que
// alimentam a visão operacional do módulo Mercado do Café.

"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/corretoraRegionalStatsRepository");

function parseDaysBack(query, max = 180) {
  const n = Number(query.days);
  if (!Number.isFinite(n) || n <= 0) return 30;
  if (n > max) return max;
  return Math.floor(n);
}

function parseLimit(query, defaultValue = 50, max = 200) {
  const n = Number(query.limit);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  if (n > max) return max;
  return Math.floor(n);
}

/**
 * GET /api/admin/mercado-do-cafe/stats/regional
 * KPIs gerais do ecossistema regional nos últimos N dias (default 30).
 */
async function getRegionalKpis(req, res, next) {
  try {
    const daysBack = parseDaysBack(req.query);
    const data = await repo.getRegionalKpis({ daysBack });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar KPIs regionais.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/leads-por-cidade
 * Ranking de cidades (do produtor) por volume de leads gerados.
 */
async function getLeadsPorCidade(req, res, next) {
  try {
    const daysBack = parseDaysBack(req.query);
    const limit = parseLimit(req.query, 20);
    const data = await repo.getLeadsPorCidade({ daysBack, limit });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar leads por cidade.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/corretoras-performance
 * Performance de cada corretora (leads, SLA, conversão).
 */
async function getCorretorasPerformance(req, res, next) {
  try {
    const daysBack = parseDaysBack(req.query);
    const limit = parseLimit(req.query);
    const data = await repo.getCorretorasPerformance({ daysBack, limit });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar performance das corretoras.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/leads-pendurados
 * Leads sem resposta há mais de N horas (default 24).
 */
async function getLeadsPendurados(req, res, next) {
  try {
    const hoursBack = Math.max(
      1,
      Math.min(720, Number(req.query.hours) || 24),
    );
    const limit = parseLimit(req.query);
    const data = await repo.getLeadsPendurados({ hoursBack, limit });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar leads pendurados.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/cidade/:cidade
 * Snapshot de uma cidade específica. Param obrigatório.
 */
async function getCidadeSnapshot(req, res, next) {
  try {
    const cidade = String(req.params.cidade || "").trim();
    if (!cidade) {
      throw new AppError(
        "Cidade é obrigatória.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const daysBack = parseDaysBack(req.query);
    const data = await repo.getCidadeSnapshot(cidade, { daysBack });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar snapshot da cidade.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/corregos-ativos
 * Sprint 7 — Top córregos por volume de leads na janela
 * (default 7 dias). Insumo do widget "Córregos ativos" no admin.
 */
async function getCorregosAtivos(req, res, next) {
  try {
    const daysBack = Math.max(1, Math.min(90, Number(req.query.days) || 7));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 5));
    const leadsRepo = require("../repositories/corretoraLeadsRepository");
    const data = await leadsRepo.getTopCorregos({ daysBack, limit });
    response.ok(res, { days_back: daysBack, items: data });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar córregos ativos.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/admin/mercado-do-cafe/stats/corretora/:id
 * Dossiê completo da corretora para drill-down do admin.
 */
async function getCorretoraDossie(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const daysBack = parseDaysBack(req.query);
    const data = await repo.getCorretoraDossie(id, { daysBack });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar dossiê da corretora.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  getRegionalKpis,
  getLeadsPorCidade,
  getCorretorasPerformance,
  getLeadsPendurados,
  getCidadeSnapshot,
  getCorretoraDossie,
  getCorregosAtivos,
};
