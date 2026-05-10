"use strict";

// Decisao Comercial 2026-05-06 — Zod schemas para fluxo de planos da
// corretora (self-service) e admin (atribuicao manual / edicao).
//
// Aplicados via middleware/validate em rotas. Valor de body validado
// vira req.body limpo e tipado, sem if (!campo) cru no controller.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Self-service (corretora autenticada)
// ---------------------------------------------------------------------------

/** POST /api/corretora/plan/upgrade — body: { plan_id } */
const upgradeBodySchema = z
  .object({
    plan_id: z.coerce
      .number({ invalid_type_error: "plan_id deve ser numerico." })
      .int("plan_id deve ser inteiro.")
      .positive("plan_id deve ser positivo."),
  })
  .strip();

/** POST /api/corretora/plan/checkout — body: { plan_id } */
const checkoutBodySchema = upgradeBodySchema;

/**
 * POST /api/corretora/plan/enterprise-contact
 * body: { message?, phone? } — ambos opcionais. Mensagem para canal
 * comercial; backend so registra audit + responde com canais oficiais.
 */
const enterpriseContactBodySchema = z
  .object({
    message: z
      .string()
      .trim()
      .max(1000, "Mensagem muito longa (max 1000 caracteres).")
      .optional()
      .nullable(),
    phone: z
      .string()
      .trim()
      .max(30, "Telefone muito longo.")
      .optional()
      .nullable(),
  })
  .strip();

/** POST /api/corretora/plan/cancel — body: { reason? } */
const cancelBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500, "Motivo muito longo (max 500 caracteres).")
      .optional()
      .nullable(),
  })
  .strip();

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/monetization/corretoras/:corretoraId/subscription
 * body completo de atribuicao manual de plano.
 */
const adminAssignSubscriptionBodySchema = z
  .object({
    plan_id: z.coerce.number().int().positive(),
    status: z
      .enum(["active", "trialing", "past_due", "canceled", "expired"])
      .optional(),
    payment_method: z
      .enum(["manual", "pix", "boleto", "cartao"])
      .optional()
      .nullable(),
    monthly_price_cents: z.coerce.number().int().nonnegative().optional().nullable(),
    trial_ends_at: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .optional()
      .nullable(),
    current_period_end: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .optional()
      .nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    provider: z.string().trim().max(30).optional().nullable(),
    provider_subscription_id: z.string().trim().max(120).optional().nullable(),
    source: z
      .enum(["manual_admin", "commercial_contract", "checkout"])
      .optional(),
    // Motivo da alteração feita pelo admin. Vai parar no meta do
    // subscription_events (auditoria financeira / churn analytics)
    // e no audit_log. Evita "alteração silenciosa" — admin é
    // obrigado a justificar quando mudar plano/status.
    reason: z
      .string()
      .trim()
      .min(3, "Motivo muito curto.")
      .max(500, "Motivo muito longo (máx 500 caracteres).")
      .optional()
      .nullable(),
    meta: z.record(z.unknown()).optional(),
  })
  .strip();

/**
 * PUT /api/admin/monetization/corretoras/:corretoraId/subscription
 * patch — todos os campos opcionais.
 */
const adminUpdateSubscriptionBodySchema = adminAssignSubscriptionBodySchema
  .partial();

module.exports = {
  upgradeBodySchema,
  checkoutBodySchema,
  enterpriseContactBodySchema,
  cancelBodySchema,
  adminAssignSubscriptionBodySchema,
  adminUpdateSubscriptionBodySchema,
};
