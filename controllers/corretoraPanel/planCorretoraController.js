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

    // Decisao Comercial 2026-05-06 — UI mostra badge "Destaque automatico
    // ativo" quando o plano contratado libera regional_highlight e a
    // assinatura esta vigente. Reflete o que o publico realmente exibe
    // (regra recalculada em SQL no corretorasPublicRepository).
    const highlight_active = planService.isHighlightActive(ctx);

    // Canais oficiais de suporte da curadoria Kavita. UI usa para o
    // bloco "Fale com a Kavita" no painel /planos.
    //
    // Fallbacks garantem que o bloco APARECA sempre na UI, mesmo
    // quando o deploy ainda nao tem as envs setadas. Sao:
    //   - email: rickjanuario0@gmail.com (curadoria Kavita atual)
    //   - whatsapp: null por padrao (so aparece se env existir)
    //
    // Sobrescreva em producao com:
    //   KAVITA_COMMERCIAL_EMAIL=...
    //   KAVITA_COMMERCIAL_WHATSAPP=5532999999999  (so digitos)
    const support = {
      whatsapp: process.env.KAVITA_COMMERCIAL_WHATSAPP || null,
      email:
        process.env.KAVITA_COMMERCIAL_EMAIL || "rickjanuario0@gmail.com",
    };

    response.ok(res, { ...ctx, usage, highlight_active, support });
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
 * Decisao Comercial 2026-05-06 — self-service so pode ATIVAR FREE.
 * Para PRO/MAX, o frontend chama POST /checkout (gera cobranca Asaas).
 * Para Enterprise, o frontend chama POST /enterprise-contact (abre
 * tratativa comercial — nao ativa nada).
 *
 * Bloqueamos planos pagos aqui mesmo: e o backend que define o
 * contrato. UI desatualizada nao consegue contornar.
 */
async function requestUpgrade(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const planId = Number(req.body?.plan_id);
    if (!Number.isInteger(planId) || planId <= 0) {
      throw new AppError(
        "Selecione um plano valido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const plan = await plansRepo.findById(planId);
    if (!plan || !plan.is_active) {
      throw new AppError(
        "Plano invalido ou inativo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (plan.slug === planService.ENTERPRISE_SLUG || plan.is_public === false) {
      throw new AppError(
        "Plano Enterprise e fechado por contrato comercial. Use 'Falar com time'.",
        ERROR_CODES.FORBIDDEN,
        403,
        { reason: "enterprise_only" },
      );
    }
    if (Number(plan.price_cents) > 0) {
      throw new AppError(
        "Plano pago exige checkout. Use a opcao de pagamento.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { reason: "checkout_required", checkout_endpoint: "/api/corretora/plan/checkout" },
      );
    }

    const result = await planService.assignPlan({
      corretoraId,
      planId,
      opts: {
        status: "active",
        // FREE: e gratuito, payment_method=manual e o estado correto
        // (nao ha gateway envolvido).
        payment_method: "manual",
        actor_type: "corretora_user",
        actor_id: req.corretoraUser.id,
        meta: {
          source: "corretora_self_upgrade",
          requested_by: req.corretoraUser.id,
          requested_at: new Date().toISOString(),
        },
      },
    });
    response.ok(res, result, "Plano gratuito ativado.");
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

    const corretora = await adminRepo.findById(corretoraId);
    if (!corretora) {
      throw new AppError(
        "Corretora nao encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }

    // Decisao Comercial 2026-05-06 — guarda contra contratacao indevida
    // (Enterprise self-service, plano inativo, KYC reprovado). Concentra
    // a regra em um lugar, evita drift entre rotas.
    await planService.assertSelfServiceContractable({
      plan,
      kycStatus: corretora.kyc_status ?? null,
    });

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

/**
 * POST /api/corretora/plan/enterprise-contact
 * Body: { message?: string, phone?: string }
 *
 * Decisao Comercial 2026-05-06 — Enterprise nunca ativa plano por
 * clique. Esta rota apenas:
 *   1. Registra evento "enterprise_contact_requested" no historico de
 *      assinatura para audit trail (quem pediu, quando, mensagem).
 *   2. Retorna canal oficial de contato (whatsapp/email) para a UI
 *      poder abrir.
 *
 * NAO altera subscription, NAO atribui plano, NAO destaca corretora.
 * Curadoria Kavita responde manualmente; quando contrato e fechado, o
 * admin atribui o plano enterprise via SubscriptionManager.
 */
async function enterpriseContact(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim().slice(0, 1000)
        : null;
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim().slice(0, 30)
        : null;

    // Localiza plano enterprise (se existir) so para registrar to_plan_id
    // no evento — facilita relatorios depois.
    const enterprise = await plansRepo.findBySlug(planService.ENTERPRISE_SLUG);

    subEventsRepo
      .create({
        corretora_id: corretoraId,
        subscription_id: null,
        event_type: "enterprise_contact_requested",
        from_plan_id: null,
        to_plan_id: enterprise?.id ?? null,
        from_status: null,
        to_status: null,
        plan_snapshot: null,
        meta: {
          source: "corretora_self_enterprise_contact",
          requested_by: req.corretoraUser.id,
          requested_at: new Date().toISOString(),
          message,
          phone,
        },
        actor_type: "corretora_user",
        actor_id: req.corretoraUser.id,
      })
      .catch((err) =>
        logger.warn(
          { err, corretoraId },
          "corretora.plan.enterprise_contact.event_failed",
        ),
      );

    logger.info(
      { corretoraId, userId: req.corretoraUser.id },
      "corretora.plan.enterprise_contact.requested",
    );

    response.ok(
      res,
      {
        ok: true,
        // Canal oficial — UI mostra estes para a corretora abrir.
        // Curadoria responde manualmente.
        contact: {
          whatsapp: process.env.KAVITA_COMMERCIAL_WHATSAPP || null,
          email: process.env.KAVITA_COMMERCIAL_EMAIL || null,
        },
      },
      "Pedido recebido. A curadoria Kavita vai entrar em contato em ate 1 dia util.",
    );
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
  enterpriseContact,
};
