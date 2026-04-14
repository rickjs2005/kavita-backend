// controllers/admin/adminPlansController.js
//
// CRUD de planos, gestão de subscriptions das corretoras e destaques
// pagos por cidade. Admin-only via verifyAdmin no mount.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const plansRepo = require("../../repositories/plansRepository");
const subsRepo = require("../../repositories/subscriptionsRepository");
const promosRepo = require("../../repositories/cityPromotionsRepository");
const planService = require("../../services/planService");

// ─── Plans ──────────────────────────────────────────────────────────────────

async function listPlans(_req, res, next) {
  try {
    const data = await plansRepo.listAll();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
}

async function createPlan(req, res, next) {
  try {
    if (!req.body.slug || !req.body.name) {
      throw new AppError(
        "slug e name são obrigatórios.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const existing = await plansRepo.findBySlug(req.body.slug);
    if (existing) {
      throw new AppError(
        "Já existe um plano com este slug.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    const id = await plansRepo.create(req.body);
    response.created(res, { id });
  } catch (err) {
    next(err);
  }
}

async function updatePlan(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const affected = await plansRepo.update(id, req.body);
    if (affected === 0) {
      throw new AppError("Nada para atualizar.", ERROR_CODES.NOT_FOUND, 404);
    }
    const fresh = await plansRepo.findById(id);
    response.ok(res, fresh, "Plano atualizado.");
  } catch (err) {
    next(err);
  }
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

async function getCorretoraSubscription(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const ctx = await planService.getPlanContext(corretoraId);
    const history = await subsRepo.listForCorretora(corretoraId);
    response.ok(res, { current: ctx, history });
  } catch (err) {
    next(err);
  }
}

async function assignPlanToCorretora(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    const planId = Number(req.body.plan_id);
    if (!Number.isInteger(corretoraId) || !Number.isInteger(planId)) {
      throw new AppError(
        "corretora_id e plan_id são obrigatórios.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const result = await planService.assignPlan({
      corretoraId,
      planId,
      opts: {
        status: req.body.status,
        provider: req.body.provider,
        provider_subscription_id: req.body.provider_subscription_id,
        meta: { assigned_by_admin_id: req.admin?.id ?? null, ...req.body.meta },
      },
    });
    require("../../services/adminAuditService").record({
      req,
      action: "plan.assigned",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { plan_id: planId },
    });
    response.ok(res, result, "Plano atribuído.");
  } catch (err) {
    next(err);
  }
}

async function cancelCorretoraSubscription(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await subsRepo.cancelActiveForCorretora(corretoraId);
    response.ok(res, null, "Subscription cancelada.");
  } catch (err) {
    next(err);
  }
}

// ─── City promotions ────────────────────────────────────────────────────────

async function listCityPromotions(_req, res, next) {
  try {
    const data = await promosRepo.listAllActive();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
}

async function createCityPromotion(req, res, next) {
  try {
    const { corretora_id, city, days, ends_at, price_cents } = req.body;
    if (!corretora_id || !city) {
      throw new AppError(
        "corretora_id e city são obrigatórios.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    let end = ends_at ? new Date(ends_at) : null;
    if (!end && days) {
      end = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
    }
    if (!end || Number.isNaN(end.getTime())) {
      throw new AppError(
        "Informe days ou ends_at.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const id = await promosRepo.create({
      corretora_id: Number(corretora_id),
      city: String(city),
      ends_at: end,
      price_cents: Number(price_cents) || 0,
    });
    response.created(res, { id });
  } catch (err) {
    next(err);
  }
}

async function deactivateCityPromotion(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await promosRepo.deactivate(id);
    response.ok(res, null, "Destaque desativado.");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPlans,
  createPlan,
  updatePlan,
  getCorretoraSubscription,
  assignPlanToCorretora,
  cancelCorretoraSubscription,
  listCityPromotions,
  createCityPromotion,
  deactivateCityPromotion,
};
