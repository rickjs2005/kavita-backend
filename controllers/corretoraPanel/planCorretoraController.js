// controllers/corretoraPanel/planCorretoraController.js
//
// Endpoint /api/corretora/plan — frontend do painel consulta para
// saber o que pode/não pode mostrar + uso atual vs limite do plano.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const planService = require("../../services/planService");
const paymentService = require("../../services/corretoraPaymentService");
const plansRepo = require("../../repositories/plansRepository");
const adminRepo = require("../../repositories/corretorasAdminRepository");
const subsRepo = require("../../repositories/subscriptionsRepository");
const usersRepo = require("../../repositories/corretoraUsersRepository");
const subEventsRepo = require("../../repositories/subscriptionEventsRepository");
const logger = require("../../lib/logger");

async function getMyPlan(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const ctx = await planService.getPlanContext(corretoraId);

    // Uso real vs limites. ETAPA 1.4 adiciona leads_this_month.
    const leadsRepo = require("../../repositories/corretoraLeadsRepository");
    const [usersTotal, leadsThisMonth] = await Promise.all([
      usersRepo.countByCorretoraId(corretoraId),
      leadsRepo.countInCurrentMonth(corretoraId),
    ]);
    const usage = {
      users: {
        used: usersTotal,
        limit: ctx.capabilities?.max_users ?? null,
      },
      leads_this_month: {
        used: leadsThisMonth,
        limit: ctx.capabilities?.max_leads_per_month ?? null,
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
        // actor_type/id vão para subscription_events — classifica o
        // upgrade como self-service (não admin) para análise de churn.
        actor_type: "corretora_user",
        actor_id: req.corretoraUser.id,
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

/**
 * POST /api/corretora/plan/checkout
 * Body: { plan_id: number }
 *
 * Fase 6 — liga o upgrade da corretora ao Asaas. Quando o gateway
 * está configurado, gera uma subscription remota + URL de checkout e
 * retorna a URL pro frontend redirecionar. Quando NÃO está
 * configurado (dev local ou ambiente sem credenciais), responde 503
 * com um flag `gateway_unavailable` — o frontend cai no POST /upgrade
 * manual como fallback.
 *
 * Não altera a subscription local aqui — só prepara a cobrança
 * remota. O webhook do Asaas (payment_confirmed) vai mudar o status
 * via subscriptionWebhookService quando o pagamento efetivar.
 */
async function createCheckout(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const planId = Number(req.body?.plan_id);
    if (!Number.isInteger(planId) || planId <= 0) {
      throw new AppError(
        "Selecione um plano válido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    if (!paymentService.isGatewayActive()) {
      // Retorno controlado pro frontend detectar e cair no fluxo manual
      // sem quebrar a UI com erro técnico.
      return response.ok(
        res,
        { gateway_available: false },
        "Pagamento automático indisponível neste ambiente.",
      );
    }

    const plan = await plansRepo.findById(planId);
    if (!plan || !plan.is_active) {
      throw new AppError(
        "Plano inválido ou inativo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (!plan.is_public) {
      throw new AppError(
        "Plano não disponível para contratação direta.",
        ERROR_CODES.FORBIDDEN,
        403,
      );
    }

    const corretora = await adminRepo.findById(corretoraId);
    if (!corretora) {
      throw new AppError(
        "Corretora não encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    if (!corretora.email) {
      throw new AppError(
        "Cadastre um e-mail institucional no perfil antes de assinar.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { field: "email" },
      );
    }

    const checkout = await paymentService.createCheckoutForCorretora({
      corretora,
      plan,
      externalReference: `kavita-corretora-${corretoraId}-plan-${plan.id}-u${req.corretoraUser.id}`,
    });

    // Anotamos provider + provider_subscription_id na subscription atual
    // (se existir) pra ligar o fluxo remoto à linha local. O webhook
    // posterior vai conseguir encontrar a subscription certa via
    // provider_subscription_id na tabela corretora_subscriptions.
    //
    // ETAPA 1.2 — persistimos pending_checkout_url/at para a corretora
    // poder reabrir o link caso feche a aba antes de pagar. O handler
    // do webhook de payment_confirmed zera ambos (ver
    // services/payment/webhookDomainHandler).
    const current = await subsRepo.getCurrentForCorretora(corretoraId);
    if (current) {
      await subsRepo.update(current.id, {
        provider: checkout.provider,
        provider_subscription_id: checkout.subscription_id,
        provider_status: "pending_checkout",
        pending_checkout_url: checkout.checkout_url,
        pending_checkout_at: new Date(),
      });
    }

    logger.info(
      {
        corretoraId,
        planId: plan.id,
        planSlug: plan.slug,
        provider: checkout.provider,
        subscriptionId: checkout.subscription_id,
      },
      "corretora.plan.checkout.created",
    );

    return response.ok(
      res,
      {
        gateway_available: true,
        provider: checkout.provider,
        checkout_url: checkout.checkout_url,
        subscription_id: checkout.subscription_id,
        next_due_date: checkout.next_due_date,
      },
      "Cobrança criada. Abra o link para pagar.",
    );
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao criar cobrança.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/corretora/plan/cancel
 * Body: { reason?: string }
 *
 * Cancela o plano pago atual. Efeito: corretora volta ao FREE
 * automaticamente — acesso ao painel continua, mas features pagas
 * (export, destaque, advanced_reports, max_users > 1) bloqueiam.
 *
 * Só o owner pode cancelar (decisão comercial). Manager/sales/viewer
 * caem em 403.
 *
 * Se a corretora já está no FREE, o endpoint é idempotente e retorna
 * 200 com `already_free: true` — evita erro confuso se a UI mostrou
 * o botão por race condition.
 *
 * Nota: cancelamento no gateway (Asaas) fica como best-effort em
 * background — o paymentService trata nos webhooks. Aqui a subscription
 * local já é cancelada de imediato pra não deixar UI dessincronizada.
 */
async function cancelMyPlan(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const role = req.corretoraUser.role;

    if (role !== "owner") {
      throw new AppError(
        "Apenas a proprietária da conta pode cancelar o plano.",
        ERROR_CODES.FORBIDDEN,
        403,
      );
    }

    const reason = typeof req.body?.reason === "string"
      ? req.body.reason.trim().slice(0, 500)
      : null;

    const result = await planService.cancelPlan({
      corretoraId,
      opts: {
        actor_type: "corretora_user",
        actor_id: req.corretoraUser.id,
        reason,
        source: "corretora_self_cancel",
      },
    });

    // Best-effort: avisa paymentService pra cancelar no gateway remoto
    // (Asaas). Se falhar, log + segue — subscription local já está
    // cancelada e o webhook de conciliação do Asaas vai fechar o loop.
    if (!result.already_free && paymentService.isGatewayActive()) {
      paymentService
        .cancelRemoteSubscription?.(corretoraId)
        .catch((err) =>
          logger.warn(
            { err, corretoraId },
            "corretora.plan.cancel.remote_cancel_failed",
          ),
        );
    }

    const msg = result.already_free
      ? "Você já está no plano gratuito."
      : "Plano cancelado. Você voltou ao plano gratuito.";

    response.ok(res, result, msg);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/corretora/plan/events
 * Histórico de eventos da própria corretora — trialing, upgrade,
 * downgrade, expiração, etc. Fonte de verdade para a UI do painel
 * renderizar linha do tempo de assinatura.
 */
async function listMyPlanEvents(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const items = await subEventsRepo.listForCorretora(corretoraId, {
      limit: 30,
    });
    response.ok(res, items);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyPlan,
  listAvailablePlans,
  requestUpgrade,
  createCheckout,
  cancelMyPlan,
  listMyPlanEvents,
};
