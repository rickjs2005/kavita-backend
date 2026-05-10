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
const eventsRepo = require("../../repositories/subscriptionEventsRepository");
const promosRepo = require("../../repositories/cityPromotionsRepository");
const planService = require("../../services/planService");
const logger = require("../../lib/logger");
const broadcastTokens = require("../../lib/broadcastPreviewTokens");

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

    // Bloco 5 — token com TTL 10min contendo hash das capabilities.
    // O frontend precisa devolver este token no PUT /plans/:id quando
    // apply_to_active_subscriptions=true. Se as capabilities mudarem
    // entre preview e apply, o hash não bate e o backend rejeita.
    const plan = await plansRepo.findById(id);
    const confirmation_token = broadcastTokens.generateToken(
      id,
      plan?.capabilities ?? null,
    );
    const token_expires_at = new Date(
      Date.now() + broadcastTokens.TTL_MS,
    ).toISOString();

    response.ok(res, {
      ...preview,
      confirmation_token,
      token_expires_at,
      token_ttl_ms: broadcastTokens.TTL_MS,
    });
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
    const confirmationToken = req.body?.broadcast_confirmation_token ?? null;
    const updatePayload = { ...req.body };
    delete updatePayload.apply_to_active_subscriptions;
    delete updatePayload.broadcast_confirmation_token;

    // Fase 7 — snapshot antes do UPDATE pro audit before/after
    const before = await plansRepo.findById(id);

    // Bloco 5 — preview obrigatório. Quando o admin pede broadcast, o
    // token tem que existir, estar dentro do TTL e o hash das
    // capabilities precisa bater com as capabilities vigentes AGORA
    // (as do `before`, antes do UPDATE). Isso impede aplicar broadcast
    // com base em preview obsoleto — se o plano mudou nos últimos 10
    // minutos, refaça a conferência.
    if (applyToActive) {
      const check = broadcastTokens.verifyToken(
        confirmationToken,
        id,
        before?.capabilities ?? null,
      );
      if (!check.ok) {
        const reasons = {
          missing:
            "Broadcast exige confirmação. Abra o preview e tente novamente.",
          malformed: "Token de confirmação malformado.",
          plan_mismatch:
            "Token de confirmação é de outro plano. Refaça o preview.",
          expired:
            "Token de confirmação expirou (10 min). Abra o preview novamente.",
          bad_signature:
            "Assinatura do token inválida. Refaça o preview.",
          plan_changed:
            "O plano mudou desde o último preview. Abra o preview novamente para revisar o novo impacto.",
        };
        throw new AppError(
          reasons[check.reason] || "Token de confirmação inválido.",
          ERROR_CODES.VALIDATION_ERROR,
          check.reason === "plan_changed" ? 409 : 400,
          { reason: check.reason },
        );
      }
    }

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
      throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const ctx = await planService.getPlanContext(corretoraId);
    const rawSub = await subsRepo.getCurrentForCorretora(corretoraId);
    const history = await subsRepo.listForCorretora(corretoraId);

    // Decisao Comercial 2026-05-06 — UI admin precisa de subscription
    // achatada (id, plan_slug, plan_name, payment_method, provider,
    // meta) para o SubscriptionManager. ctx tem o "shape" amigavel
    // mas perde os campos crus. Devolvemos os dois: `current` para a
    // UI (compat) e `context` (capabilities + plan + status).
    let current = null;
    if (rawSub) {
      let meta = rawSub.meta;
      if (typeof meta === "string") {
        try {
          meta = JSON.parse(meta);
        } catch {
          meta = null;
        }
      }
      current = {
        ...rawSub,
        meta,
        plan_capabilities: undefined, // remover snapshot duplicado
      };
    }

    response.ok(res, { current, context: ctx, history });
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
        "corretora_id e plan_id sao obrigatorios.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    // Decisao Comercial 2026-05-06 — origem da assinatura precisa
    // refletir como ela foi contratada para auditoria/relatorios:
    //   - "checkout"            : criada pelo gateway via webhook
    //   - "manual_admin"        : admin marcou pago fora do gateway
    //   - "commercial_contract" : Enterprise / negociado
    //
    // Self-service (corretora) nao usa este endpoint — vai por
    // /api/corretora/plan/checkout ou /upgrade.
    const allowedSources = new Set([
      "manual_admin",
      "commercial_contract",
      "checkout",
    ]);
    const source = allowedSources.has(req.body?.source)
      ? req.body.source
      : "manual_admin";

    // payment_method canonico segue source quando admin nao especifica:
    //   manual_admin        -> "manual"
    //   commercial_contract -> "manual" (cobranca fora do app)
    //   checkout            -> deixar como veio do body (provavelmente
    //                          'pix' ou 'cartao' via Asaas)
    const paymentMethod =
      req.body?.payment_method ??
      (source === "checkout" ? null : "manual");

    const result = await planService.assignPlan({
      corretoraId,
      planId,
      opts: {
        status: req.body.status,
        provider: req.body.provider ?? null,
        provider_subscription_id: req.body.provider_subscription_id ?? null,
        payment_method: paymentMethod,
        actor_type: "admin",
        actor_id: req.admin?.id ?? null,
        meta: {
          source,
          assigned_by_admin_id: req.admin?.id ?? null,
          assigned_by_admin_nome: req.admin?.nome ?? null,
          assigned_at: new Date().toISOString(),
          ...(req.body.meta || {}),
        },
      },
    });
    require("../../services/adminAuditService").record({
      req,
      action: "plan.assigned",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { plan_id: planId, source, payment_method: paymentMethod },
    });
    response.ok(res, result, "Plano atribuido.");
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
          ? { ...diff, reason: body.reason ?? null }
          : { patch, reason: body.reason ?? null }, // fallback quando diff vazio (ex.: noop)
    });

    // Append-only no subscription_events sempre que mudar plano ou
    // status — é o que alimenta a timeline do painel da corretora e a
    // análise financeira de churn. Ajuste em datas/notas só vai pro
    // audit_log, sem poluir a timeline.
    //
    // Convenções de event_type (alinhadas com planService.assignPlan):
    //   - upgraded       : plano novo com price_cents > anterior
    //   - downgraded     : plano novo com price_cents < anterior
    //   - status_changed : mesmo plano, status diferente
    //
    // Roda fora da transação (best-effort) — falha de evento não
    // reverte a edição que o admin acabou de salvar.
    const planChanged = current.plan_id !== updated.plan_id;
    const statusChanged = current.status !== updated.status;
    if (planChanged || statusChanged) {
      let toPlan = null;
      let fromPlan = null;
      try {
        if (planChanged) {
          [toPlan, fromPlan] = await Promise.all([
            plansRepo.findById(updated.plan_id).catch(() => null),
            plansRepo.findById(current.plan_id).catch(() => null),
          ]);
        }
      } catch (err) {
        logger.warn(
          { err, corretoraId, subscriptionId: current.id },
          "subscription.update.plan_lookup_failed",
        );
      }

      let eventType = "status_changed";
      if (planChanged) {
        const fromPrice = Number(fromPlan?.price_cents ?? current.monthly_price_cents ?? 0);
        const toPrice = Number(toPlan?.price_cents ?? updated.monthly_price_cents ?? 0);
        eventType = toPrice >= fromPrice ? "upgraded" : "downgraded";
      }

      eventsRepo
        .create({
          corretora_id: corretoraId,
          subscription_id: updated.id,
          event_type: eventType,
          from_plan_id: current.plan_id ?? null,
          to_plan_id: updated.plan_id ?? null,
          from_status: current.status ?? null,
          to_status: updated.status ?? null,
          plan_snapshot: toPlan
            ? {
                id: toPlan.id,
                slug: toPlan.slug,
                name: toPlan.name,
                price_cents: toPlan.price_cents ?? null,
                billing_cycle: toPlan.billing_cycle ?? null,
              }
            : null,
          meta: {
            source: body.source ?? "manual_admin",
            reason: body.reason ?? null,
            edited_by_admin_id: req.admin?.id ?? null,
            edited_by_admin_nome: req.admin?.nome ?? null,
            edited_at: new Date().toISOString(),
          },
          actor_type: "admin",
          actor_id: req.admin?.id ?? null,
        })
        .catch((err) =>
          logger.warn(
            { err, corretoraId, subscriptionId: updated.id },
            "subscription.update.event_failed",
          ),
        );
    }

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
