// controllers/corretoraPanel/planCorretoraController.js
//
// Endpoint /api/corretora/plan — frontend do painel consulta para
// saber o que pode/não pode mostrar + uso atual vs limite do plano.
"use strict";

const { response } = require("../../lib");
const planService = require("../../services/planService");
const usersRepo = require("../../repositories/corretoraUsersRepository");

async function getMyPlan(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const ctx = await planService.getPlanContext(corretoraId);

    // Uso real vs limites. Hoje o único limite numérico relevante é
    // `max_users`. Adicionar outros aqui conforme novos forem criados.
    const usersTotal = await usersRepo.countByCorretoraId(corretoraId);
    const usage = {
      users: {
        used: usersTotal,
        limit: ctx.capabilities?.max_users ?? null,
      },
    };

    response.ok(res, { ...ctx, usage });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/corretora/plan/available
 * Lista planos públicos ativos — usada na tela interna de upgrade.
 */
async function listAvailablePlans(_req, res, next) {
  try {
    const plansRepo = require("../../repositories/plansRepository");
    const plans = await plansRepo.listPublic();
    response.ok(res, plans);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/plan/upgrade
 * Body: { plan_id: number }
 *
 * Troca o plano da corretora autenticada. Age sobre
 * req.corretoraUser.corretora_id — impossível trocar plano de outra.
 * Usa planService.assignPlan (transacional: cancela anterior + cria nova).
 *
 * Como billing ainda é manual, a subscription é criada com
 * payment_method=manual e status=active. Admin depois confirma
 * pagamento via SubscriptionManager.
 */
async function requestUpgrade(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const planId = Number(req.body?.plan_id);
    if (!Number.isInteger(planId) || planId <= 0) {
      const AppError = require("../../errors/AppError");
      const ERROR_CODES = require("../../constants/ErrorCodes");
      throw new AppError(
        "Selecione um plano válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const result = await planService.assignPlan({
      corretoraId,
      planId,
      opts: {
        status: "active",
        payment_method: "manual",
        meta: {
          source: "corretora_self_upgrade",
          requested_by: req.corretoraUser.id,
          requested_at: new Date().toISOString(),
        },
      },
    });
    response.ok(res, result, "Plano atualizado com sucesso.");
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPlan, listAvailablePlans, requestUpgrade };
