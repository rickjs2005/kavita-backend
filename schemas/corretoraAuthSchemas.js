// schemas/corretoraAuthSchemas.js
//
// Zod schemas da Fase 2 do Mercado do Café: login, atualização de
// perfil pela própria corretora, captura pública de lead e gestão
// de leads no painel.
"use strict";

const { z } = require("zod");

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Login da corretora (POST /api/corretora/login)
// ---------------------------------------------------------------------------

const corretoraLoginSchema = z.object({
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido.")
    .max(200)
    .transform((v) => v.trim().toLowerCase()),
  senha: z
    .string({ required_error: "Senha é obrigatória." })
    .min(6, "Senha deve ter pelo menos 6 caracteres.")
    .max(200),
});

// ---------------------------------------------------------------------------
// Edição do próprio perfil (PUT /api/corretora/profile)
// Campos editáveis pela própria corretora — NUNCA status/featured/sort_order.
// Regras espelham o baseFields do módulo original, mas sem name/city/state
// (esses ficam para aprovação/admin).
// ---------------------------------------------------------------------------

const CONTACT_FIELDS = ["phone", "whatsapp", "email", "website", "instagram", "facebook"];

const updateProfileSchema = z
  .object({
    contact_name: z
      .string()
      .min(3, "Nome do responsável deve ter pelo menos 3 caracteres.")
      .max(150)
      .transform((v) => v.trim())
      .optional(),
    description: z
      .string()
      .max(2000, "Descrição deve ter no máximo 2000 caracteres.")
      .optional()
      .nullable()
      .transform(trimOrNull),
    phone: z.string().max(20).optional().nullable().transform(trimOrNull),
    whatsapp: z.string().max(20).optional().nullable().transform(trimOrNull),
    email: z
      .string()
      .email("E-mail inválido.")
      .max(200)
      .optional()
      .nullable()
      .transform(trimOrNull),
    website: z
      .string()
      .url("URL do site inválida.")
      .max(500)
      .optional()
      .nullable()
      .transform(trimOrNull),
    instagram: z.string().max(200).optional().nullable().transform(trimOrNull),
    facebook: z.string().max(500).optional().nullable().transform(trimOrNull),
  })
  .refine(
    (data) => {
      // Se o cliente enviou algum campo de contato, pelo menos um deve ficar
      // preenchido — evita a corretora zerar todos os canais.
      const touchedContact = CONTACT_FIELDS.some((f) => f in data);
      if (!touchedContact) return true;
      return CONTACT_FIELDS.some((f) => {
        const v = data[f];
        return typeof v === "string" && v.trim().length > 0;
      });
    },
    {
      message:
        "Informe pelo menos um meio de contato (telefone, WhatsApp, e-mail, site, Instagram ou Facebook).",
      path: ["_contacts"],
    }
  );

// ---------------------------------------------------------------------------
// Captura pública de lead (POST /api/public/corretoras/:slug/leads)
// ---------------------------------------------------------------------------

const createLeadSchema = z.object({
  nome: z
    .string({ required_error: "Nome é obrigatório." })
    .min(3, "Nome deve ter pelo menos 3 caracteres.")
    .max(150)
    .transform((v) => v.trim()),
  telefone: z
    .string({ required_error: "Telefone é obrigatório." })
    .min(8, "Telefone deve ter pelo menos 8 dígitos.")
    .max(30)
    .transform((v) => v.trim()),
  cidade: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .transform(trimOrNull),
  mensagem: z
    .string()
    .max(1000, "Mensagem deve ter no máximo 1000 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
});

// ---------------------------------------------------------------------------
// Atualização de status/nota de lead pela corretora
// PATCH /api/corretora/leads/:id
// ---------------------------------------------------------------------------

const updateLeadSchema = z
  .object({
    status: z.enum(["new", "contacted", "closed", "lost"]).optional(),
    nota_interna: z
      .string()
      .max(2000, "Nota deve ter no máximo 2000 caracteres.")
      .optional()
      .nullable()
      .transform(trimOrNull),
  })
  .refine((data) => data.status !== undefined || "nota_interna" in data, {
    message: "Informe status ou nota_interna.",
  });

// ---------------------------------------------------------------------------
// Listagem de leads pela corretora
// ---------------------------------------------------------------------------

const listLeadsQuerySchema = z.object({
  status: z.enum(["new", "contacted", "closed", "lost"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Provisionamento de usuário pelo admin
// POST /api/admin/mercado-do-cafe/corretoras/:id/users
// ---------------------------------------------------------------------------

const createCorretoraUserSchema = z.object({
  nome: z
    .string({ required_error: "Nome é obrigatório." })
    .min(3, "Nome deve ter pelo menos 3 caracteres.")
    .max(150)
    .transform((v) => v.trim()),
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido.")
    .max(200)
    .transform((v) => v.trim().toLowerCase()),
  senha: z
    .string({ required_error: "Senha é obrigatória." })
    .min(8, "Senha deve ter pelo menos 8 caracteres.")
    .max(200),
});

module.exports = {
  corretoraLoginSchema,
  updateProfileSchema,
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  createCorretoraUserSchema,
};
