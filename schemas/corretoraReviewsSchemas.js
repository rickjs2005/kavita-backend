// schemas/corretoraReviewsSchemas.js
// Zod schemas do módulo de reviews de corretoras (Sprint 4).
"use strict";

const { z } = require("zod");

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Public create review (POST /api/public/corretoras/:slug/reviews)
// ---------------------------------------------------------------------------

const createReviewSchema = z.object({
  nome_autor: z
    .string({ required_error: "Nome é obrigatório." })
    .min(3, "Nome deve ter pelo menos 3 caracteres.")
    .max(150, "Nome deve ter no máximo 150 caracteres.")
    .transform((v) => v.trim()),
  cidade_autor: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .transform(trimOrNull),
  rating: z
    .coerce.number()
    .int("Avaliação deve ser um número inteiro.")
    .min(1, "Avaliação mínima é 1 estrela.")
    .max(5, "Avaliação máxima é 5 estrelas."),
  comentario: z
    .string()
    .max(2000, "Comentário deve ter no máximo 2000 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
});

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

const moderateReviewSchema = z.object({
  action: z.enum(["approve", "reject"], {
    required_error: "Ação é obrigatória (approve ou reject).",
  }),
  rejection_reason: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform(trimOrNull),
});

// ---------------------------------------------------------------------------
// Corretora reply (PATCH /api/corretora/reviews/:id/reply)
// ---------------------------------------------------------------------------
//
// Body { reply: string | null }:
//   - string com conteúdo → grava/atualiza reply público
//   - string vazia / null → remove reply (corretora desiste da resposta)
const replyReviewSchema = z.object({
  reply: z
    .string()
    .max(1000, "Resposta deve ter no máximo 1000 caracteres.")
    .optional()
    .nullable()
    .transform((v) => (typeof v === "string" ? v.trim() : null)),
});

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

const listReviewsAdminQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "all"])
    .optional()
    .default("pending"),
  corretora_id: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

module.exports = {
  createReviewSchema,
  moderateReviewSchema,
  replyReviewSchema,
  listReviewsAdminQuerySchema,
};
