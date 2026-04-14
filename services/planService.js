// services/planService.js
//
// Regras centrais do domínio de planos:
//   - listagem pública (pricing)
//   - subscription atual da corretora (com capabilities resolvidas)
//   - check de capability (com fallback Free quando sem subscription)
//   - middleware requirePlanCapability para proteger endpoints
//
// Como o enforce acontece no backend:
//   - rotas sensíveis usam requirePlanCapability("leads.export") etc.
//   - se corretora não tem subscription ativa, assume plano "free"
//   - front-end consulta /api/corretora/me/plan para hide/show UI
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const plansRepo = require("../repositories/plansRepository");
const subsRepo = require("../repositories/subscriptionsRepository");

// Capabilities conhecidas e labels. Default values = do plano Free
// (fallback quando corretora não tem subscription ativa).
const CAPABILITY_KEYS = [
  "max_users",
  "leads_export",
  "regional_highlight",
  "advanced_reports",
];

const FREE_FALLBACK = {
  max_users: 1,
  leads_export: false,
  regional_highlight: false,
  advanced_reports: false,
};

/**
 * Retorna a subscription + capabilities resolvidas da corretora.
 * Se não houver subscription ativa, retorna objeto representando
 * plano Free (fallback seguro).
 */
async function getPlanContext(corretoraId) {
  const sub = await subsRepo.getCurrentForCorretora(corretoraId);
  if (!sub) {
    // Tenta encontrar plano Free cadastrado para referência. Se não
    // existir, usa o fallback hard-coded.
    const freePlan = await plansRepo.findBySlug("free").catch(() => null);
    return {
      subscription: null,
      plan: freePlan ?? {
        slug: "free",
        name: "Free",
        price_cents: 0,
      },
      capabilities: freePlan?.capabilities ?? FREE_FALLBACK,
      status: "free_default",
    };
  }
  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      current_period_end: sub.current_period_end,
    },
    plan: {
      slug: sub.plan_slug,
      name: sub.plan_name,
      price_cents: sub.plan_price_cents,
    },
    capabilities: { ...FREE_FALLBACK, ...(sub.plan_capabilities ?? {}) },
    status: sub.status,
  };
}

/**
 * Boolean simples: a corretora pode usar esta capability?
 * Suporta:
 *   - flags booleanas: hasCapability(id, "leads_export")
 *   - limites: hasCapability(id, "max_users", currentCount + 1)
 */
async function hasCapability(corretoraId, key, requestedValue = true) {
  const ctx = await getPlanContext(corretoraId);
  const v = ctx.capabilities[key];

  if (typeof v === "boolean") return v === true;
  if (typeof v === "number") {
    // Limite: requestedValue (nova quantidade total) deve ser <= limite.
    return Number(requestedValue) <= v;
  }
  return false;
}

/**
 * Middleware Express — exige capability booleana. Para limites
 * numéricos, use checagem manual no controller (precisa do contexto,
 * ex: total de users).
 */
function requirePlanCapability(key) {
  return async (req, _res, next) => {
    const corretoraId = req.corretoraUser?.corretora_id;
    if (!corretoraId) {
      return next(new AppError("Não autenticado.", ERROR_CODES.UNAUTHORIZED, 401));
    }
    const ok = await hasCapability(corretoraId, key);
    if (!ok) {
      return next(
        new AppError(
          "Esta funcionalidade requer um plano superior.",
          ERROR_CODES.FORBIDDEN,
          403,
          { capability: key },
        ),
      );
    }
    next();
  };
}

/**
 * Atribui plano à corretora. Cancela subscription anterior e cria
 * nova. Usado pelo admin (atribuição manual) e, futuramente, pelo
 * webhook do provider.
 */
async function assignPlan({ corretoraId, planId, opts = {} }) {
  const plan = await plansRepo.findById(planId);
  if (!plan || !plan.is_active) {
    throw new AppError(
      "Plano inválido ou inativo.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  await subsRepo.cancelActiveForCorretora(corretoraId);

  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.billing_cycle === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const id = await subsRepo.create({
    corretora_id: corretoraId,
    plan_id: plan.id,
    status: opts.status ?? "active",
    current_period_start: now,
    current_period_end: periodEnd,
    provider: opts.provider ?? null,
    provider_subscription_id: opts.provider_subscription_id ?? null,
    provider_status: opts.provider_status ?? null,
    meta: opts.meta ?? null,
  });

  return subsRepo.getCurrentForCorretora(corretoraId).then((s) => ({
    id,
    ...s,
  }));
}

module.exports = {
  CAPABILITY_KEYS,
  getPlanContext,
  hasCapability,
  requirePlanCapability,
  assignPlan,
};
