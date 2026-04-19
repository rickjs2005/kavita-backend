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
const eventsRepo = require("../repositories/subscriptionEventsRepository");
const logger = require("../lib/logger");
const { withTransaction } = require("../lib/withTransaction");

// Helper para snapshot leve do plano que vai no evento. Mantém só
// os campos comercialmente relevantes — se o catálogo de planos mudar
// depois, o evento preserva o contrato no momento da atribuição.
function buildPlanSnapshot(plan) {
  if (!plan) return null;
  let capabilities = plan.capabilities;
  if (typeof capabilities === "string") {
    try {
      capabilities = JSON.parse(capabilities);
    } catch {
      capabilities = {};
    }
  }
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    price_cents: plan.price_cents ?? null,
    billing_cycle: plan.billing_cycle ?? null,
    capabilities: capabilities ?? {},
  };
}

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
  // sub.plan_capabilities já vem "efetivo" do repo (snapshot quando
  // existe, senão plano vivo). snapshot separado indica se a
  // assinatura está congelada — útil para UI admin mostrar "esta
  // corretora está na versão antiga do plano Pro" quando o plano
  // vivo difere.
  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      current_period_end: sub.current_period_end,
      trial_ends_at: sub.trial_ends_at ?? null,
      has_capabilities_snapshot: sub.capabilities_snapshot != null,
      // ETAPA 1.2 — pagamento pendente que a corretora pode reabrir
      pending_checkout_url: sub.pending_checkout_url ?? null,
      pending_checkout_at: sub.pending_checkout_at ?? null,
      // ETAPA 1.4 — cap mensal de leads pro painel mostrar uso
      provider_status: sub.provider_status ?? null,
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
  // Snapshot do plano anterior para detectar upgrade/downgrade/renew
  // no evento. Lido fora da tx porque é só leitura e simplifica o flow.
  const previous = await subsRepo.getCurrentForCorretora(corretoraId);

  const result = await withTransaction(async (conn) => {
    const plan = await plansRepo.findById(planId, conn);
    if (!plan || !plan.is_active) {
      throw new AppError(
        "Plano inválido ou inativo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    await subsRepo.cancelActiveForCorretora(corretoraId, conn);

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.billing_cycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Fase 5.4 — Congelamos as capabilities no momento da atribuição.
    // Mudanças posteriores no catálogo de planos NÃO afetam esta
    // subscription até que o admin faça broadcast explícito.
    const planSnapshot = buildPlanSnapshot(plan);
    const capabilitiesSnapshot = planSnapshot?.capabilities ?? {};

    const id = await subsRepo.create(
      {
        corretora_id: corretoraId,
        plan_id: plan.id,
        status: opts.status ?? "active",
        current_period_start: now,
        current_period_end: periodEnd,
        provider: opts.provider ?? null,
        provider_subscription_id: opts.provider_subscription_id ?? null,
        provider_status: opts.provider_status ?? null,
        meta: opts.meta ?? null,
        payment_method: opts.payment_method ?? null,
        monthly_price_cents: plan.price_cents ?? null,
        capabilities_snapshot: capabilitiesSnapshot,
      },
      conn,
    );

    const current = await subsRepo.getCurrentForCorretora(corretoraId, conn);
    return { id, current, plan };
  });

  // Log de evento fora da transação — falha não deve reverter o plano.
  // Classifica como upgrade/downgrade por preço; "assigned" se é a
  // primeira atribuição da corretora.
  let eventType = "assigned";
  if (previous && previous.plan_id && previous.plan_id !== result.plan.id) {
    const prevPrice = Number(previous.monthly_price_cents ?? 0);
    const newPrice = Number(result.plan.price_cents ?? 0);
    eventType = newPrice > prevPrice ? "upgraded" : "downgraded";
  }

  eventsRepo
    .create({
      corretora_id: corretoraId,
      subscription_id: result.id,
      event_type: eventType,
      from_plan_id: previous?.plan_id ?? null,
      to_plan_id: result.plan.id,
      from_status: previous?.status ?? null,
      to_status: opts.status ?? "active",
      plan_snapshot: buildPlanSnapshot(result.plan),
      meta: {
        payment_method: opts.payment_method ?? null,
        provider: opts.provider ?? null,
      },
      actor_type: opts.actor_type ?? "admin",
      actor_id: opts.actor_id ?? null,
    })
    .catch((err) =>
      logger.warn(
        { err, corretoraId, subscriptionId: result.id },
        "subscription.assign.event_failed",
      ),
    );

  return { id: result.id, ...result.current };
}

/**
 * Cancela o plano ativo da corretora e atribui o plano FREE na
 * mesma transação. Emite evento `canceled` (não `downgraded` — fica
 * explícito em churn analytics que foi ação deliberada de cancelar,
 * não uma migração entre planos pagos).
 *
 * opts:
 *   - actor_type: "corretora_user" | "admin" | "system"
 *   - actor_id:   number | null
 *   - reason:     string opcional (vai pro meta do evento — feedback)
 *   - targetPlanSlug: default "free". Admin pode passar null pra
 *     deixar a corretora SEM plano ativo (força reativação manual).
 *
 * Se a corretora já está no FREE (sem plano pago), devolve idempotente
 * sem erro — fica seguro chamar "cancelar" mesmo sem saber o estado.
 */
async function cancelPlan({ corretoraId, opts = {} }) {
  const previous = await subsRepo.getCurrentForCorretora(corretoraId);

  // Idempotência: se o único plano atual é FREE (price_cents=0) ou
  // não existe subscription nenhuma, não há o que cancelar.
  const alreadyFreeOrNone =
    !previous ||
    Number(previous.monthly_price_cents ?? 0) === 0;
  if (alreadyFreeOrNone) {
    return {
      already_free: true,
      current: previous ?? null,
    };
  }

  const targetSlug =
    opts.targetPlanSlug === null ? null : opts.targetPlanSlug ?? "free";

  const result = await withTransaction(async (conn) => {
    // 1) Cancela subscription ativa — bate status='canceled' + canceled_at.
    await subsRepo.cancelActiveForCorretora(corretoraId, conn);

    if (targetSlug === null) {
      // Admin optou por deixar a corretora SEM plano ativo — sai da tx
      // sem criar nada. Corretora vai entrar em modo degradado.
      return { newSubId: null, newPlan: null };
    }

    const targetPlan = await plansRepo.findBySlug(targetSlug, conn);
    if (!targetPlan || !targetPlan.is_active) {
      throw new AppError(
        `Plano ${targetSlug} não encontrado ou inativo.`,
        ERROR_CODES.SERVER_ERROR,
        500,
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const planSnapshot = buildPlanSnapshot(targetPlan);
    const capabilitiesSnapshot = planSnapshot?.capabilities ?? {};

    const newSubId = await subsRepo.create(
      {
        corretora_id: corretoraId,
        plan_id: targetPlan.id,
        status: "active",
        current_period_start: now,
        current_period_end: periodEnd,
        payment_method: "manual",
        monthly_price_cents: targetPlan.price_cents ?? 0,
        capabilities_snapshot: capabilitiesSnapshot,
        meta: { assigned_by: "cancel_flow" },
      },
      conn,
    );

    return { newSubId, newPlan: targetPlan };
  });

  // Evento "canceled" — assinatura PAGA virou FREE ou nenhuma. Fica
  // fora da tx pra falha de event log não reverter o cancelamento.
  eventsRepo
    .create({
      corretora_id: corretoraId,
      subscription_id: result.newSubId ?? null,
      event_type: "canceled",
      from_plan_id: previous?.plan_id ?? null,
      to_plan_id: result.newPlan?.id ?? null,
      from_status: previous?.status ?? null,
      to_status: result.newPlan ? "active" : null,
      plan_snapshot: result.newPlan ? buildPlanSnapshot(result.newPlan) : null,
      meta: {
        reason: opts.reason ?? null,
        previous_plan_slug: previous?.plan_slug ?? null,
        previous_monthly_price_cents: previous?.monthly_price_cents ?? null,
        source: opts.source ?? null,
      },
      actor_type: opts.actor_type ?? "corretora_user",
      actor_id: opts.actor_id ?? null,
    })
    .catch((err) =>
      logger.warn(
        { err, corretoraId, subscriptionId: result.newSubId },
        "subscription.cancel.event_failed",
      ),
    );

  const current = await subsRepo.getCurrentForCorretora(corretoraId);
  return {
    already_free: false,
    previous_plan: previous
      ? {
          slug: previous.plan_slug ?? null,
          name: previous.plan_name ?? null,
          monthly_price_cents: previous.monthly_price_cents ?? 0,
        }
      : null,
    current,
  };
}

/**
 * Marca subscription como expirada (usado pelo middleware
 * verifyCorretora quando trial_ends_at passa). Dispara evento
 * "expired" com snapshot do plano em vigor.
 */
async function markExpired(subscriptionId, corretoraId) {
  const sub = await subsRepo.getCurrentForCorretora(corretoraId);
  await subsRepo.updateStatus(subscriptionId, "expired");
  eventsRepo
    .create({
      corretora_id: corretoraId,
      subscription_id: subscriptionId,
      event_type: "expired",
      from_plan_id: sub?.plan_id ?? null,
      to_plan_id: sub?.plan_id ?? null,
      from_status: sub?.status ?? null,
      to_status: "expired",
      plan_snapshot: sub
        ? buildPlanSnapshot({
            id: sub.plan_id,
            slug: sub.plan_slug,
            name: sub.plan_name,
            price_cents: sub.plan_price_cents,
            billing_cycle: sub.plan_billing_cycle,
            capabilities: sub.plan_capabilities,
          })
        : null,
      meta: { trial_ends_at: sub?.trial_ends_at ?? null },
      actor_type: "system",
      actor_id: null,
    })
    .catch((err) =>
      logger.warn(
        { err, corretoraId, subscriptionId },
        "subscription.expire.event_failed",
      ),
    );
}

/**
 * Fase 5.4 — Broadcast de capabilities de um plano recém-editado
 * para TODAS as assinaturas ativas dele. Chamado pelo
 * adminPlansController.updatePlan quando o admin marca
 * "aplicar a assinaturas ativas".
 *
 * Retorna { affected } para o caller gravar no audit log.
 *
 * Importante: isto é uma DECISÃO consciente do admin — alterar o
 * contrato vigente de N corretoras pagantes retroativamente. A UI
 * avisa claramente. Sem a flag, o comportamento padrão (e correto
 * de SaaS) é preservar o contrato do momento da assinatura.
 */
/**
 * Fase 5.4 preview — monta relatório de impacto para o admin
 * revisar ANTES de confirmar o broadcast. Retorna:
 *   - plan: info do plano + capabilities "vivas"
 *   - affected_count
 *   - subscriptions: lista resumida com nome da corretora, status,
 *     e flag indicando se já tem snapshot divergente
 */
async function getBroadcastPreview(planId) {
  const plan = await plansRepo.findById(planId);
  if (!plan) {
    throw new AppError(
      "Plano não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  const snapshot = buildPlanSnapshot(plan);
  const liveCapabilities = snapshot?.capabilities ?? {};
  const activeSubs = await subsRepo.listActiveByPlan(planId);

  const subscriptions = activeSubs.map((s) => {
    const hasSnapshot = s.capabilities_snapshot != null;
    const currentEffective = s.capabilities_snapshot ?? liveCapabilities;
    const divergent =
      hasSnapshot &&
      JSON.stringify(currentEffective) !== JSON.stringify(liveCapabilities);
    return {
      subscription_id: s.id,
      corretora_id: s.corretora_id,
      corretora_name: s.corretora_name,
      corretora_slug: s.corretora_slug,
      corretora_city: s.corretora_city,
      corretora_state: s.corretora_state,
      status: s.status,
      current_period_end: s.current_period_end,
      trial_ends_at: s.trial_ends_at,
      has_snapshot: hasSnapshot,
      divergent_from_live: divergent,
    };
  });

  return {
    plan: {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      capabilities_live: liveCapabilities,
    },
    affected_count: subscriptions.length,
    subscriptions,
  };
}

async function broadcastCapabilitiesFromPlan(planId) {
  const plan = await plansRepo.findById(planId);
  if (!plan) {
    throw new AppError(
      "Plano não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  const snapshot = buildPlanSnapshot(plan);
  const capabilitiesSnapshot = snapshot?.capabilities ?? {};
  const affected = await subsRepo.applyCapabilitiesSnapshotToActiveByPlan(
    planId,
    capabilitiesSnapshot,
  );
  logger.info(
    { planId, planSlug: plan.slug, affected },
    "plan.capabilities.broadcast",
  );
  return { affected, capabilities: capabilitiesSnapshot };
}

module.exports = {
  CAPABILITY_KEYS,
  getPlanContext,
  hasCapability,
  requirePlanCapability,
  assignPlan,
  cancelPlan,
  markExpired,
  broadcastCapabilitiesFromPlan,
  getBroadcastPreview,
};
