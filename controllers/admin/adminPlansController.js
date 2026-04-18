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

async function getBroadcastPreview(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const preview = await planService.getBroadcastPreview(id);
    response.ok(res, preview);
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

    // Fase 5.4 — flag opt-in para aplicar as novas capabilities a
    // assinaturas ativas existentes. Separamos do body da update
    // para não persistir esse boolean na tabela plans.
    const applyToActive = Boolean(req.body?.apply_to_active_subscriptions);
    const updatePayload = { ...req.body };
    delete updatePayload.apply_to_active_subscriptions;

    // Fase 7 — snapshot antes do UPDATE pro audit before/after
    const before = await plansRepo.findById(id);

    const affected = await plansRepo.update(id, updatePayload);
    if (affected === 0) {
      throw new AppError("Nada para atualizar.", ERROR_CODES.NOT_FOUND, 404);
    }
    const fresh = await plansRepo.findById(id);

    // Audita UPDATE do plano em si (separado do broadcast opcional)
    const auditService = require("../../services/adminAuditService");
    const planDiff = auditService.diffFields(before, fresh, [
      "slug",
      "name",
      "description",
      "price_cents",
      "billing_cycle",
      "capabilities",
      "sort_order",
      "is_public",
      "is_active",
    ]);
    if (planDiff.changed_fields.length > 0) {
      auditService.record({
        req,
        action: "plan.updated",
        targetType: "plan",
        targetId: id,
        meta: planDiff,
      });
    }

    let broadcast = null;
    if (applyToActive) {
      // Broadcast quebra contratos vigentes — ação deliberada. Grava
      // audit log com o número de afetadas para rastreabilidade.
      broadcast = await planService.broadcastCapabilitiesFromPlan(id);
      auditService.record({
        req,
        action: "plan.capabilities_broadcast",
        targetType: "plan",
        targetId: id,
        meta: {
          plan_slug: fresh.slug,
          affected_subscriptions: broadcast.affected,
          before: { capabilities: before?.capabilities ?? null },
          after: { capabilities: fresh?.capabilities ?? null },
          changed_fields: ["capabilities"],
        },
      });
    }

    response.ok(
      res,
      { plan: fresh, broadcast },
      broadcast
        ? `Plano atualizado. ${broadcast.affected} assinatura(s) receberam as novas capabilities.`
        : "Plano atualizado. Assinaturas existentes continuam com a versão anterior.",
    );
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

async function updateCorretoraSubscription(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const current = await subsRepo.getCurrentForCorretora(corretoraId);
    if (!current) {
      throw new AppError(
        "Nenhuma assinatura ativa para esta corretora.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    const patch = {};
    const body = req.body;
    if (body.plan_id !== undefined) patch.plan_id = Number(body.plan_id);
    if (body.status !== undefined) patch.status = body.status;
    if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
    if (body.monthly_price_cents !== undefined)
      patch.monthly_price_cents = body.monthly_price_cents != null ? Number(body.monthly_price_cents) : null;
    if (body.trial_ends_at !== undefined)
      patch.trial_ends_at = body.trial_ends_at || null;
    if (body.current_period_end !== undefined)
      patch.current_period_end = body.current_period_end || null;
    if (body.notes !== undefined) patch.notes = body.notes || null;

    await subsRepo.update(current.id, patch);
    const updated = await subsRepo.getCurrentForCorretora(corretoraId);

    // Fase 7 — before/after em subscription.updated. `current` é o
    // snapshot antes da escrita; `updated` re-lê depois.
    const auditService = require("../../services/adminAuditService");
    const diff = auditService.diffFields(current, updated, [
      "plan_id",
      "status",
      "payment_method",
      "monthly_price_cents",
      "trial_ends_at",
      "current_period_end",
      "notes",
    ]);
    auditService.record({
      req,
      action: "subscription.updated",
      targetType: "corretora",
      targetId: corretoraId,
      meta:
        diff.changed_fields.length > 0
          ? diff
          : { patch }, // fallback quando diff está vazio (ex.: noop)
    });
    response.ok(res, updated, "Assinatura atualizada.");
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
  getBroadcastPreview,
  getCorretoraSubscription,
  assignPlanToCorretora,
  updateCorretoraSubscription,
  cancelCorretoraSubscription,
  listCityPromotions,
  createCityPromotion,
  deactivateCityPromotion,
};
