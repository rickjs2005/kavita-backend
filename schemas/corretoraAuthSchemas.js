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
    // ─── Regionalização (Sprint 2) — editável pela corretora ─────
    cidades_atendidas: z
      .array(z.string().min(1).max(80))
      .max(30, "Máximo de 30 cidades atendidas.")
      .optional()
      .nullable(),
    tipos_cafe: z
      .array(
        z.enum([
          "arabica_comum",
          "arabica_especial",
          "natural",
          "cereja_descascado",
        ]),
      )
      .max(10)
      .optional()
      .nullable(),
    perfil_compra: z
      .enum(["compra", "venda", "ambos"])
      .optional()
      .nullable(),
    horario_atendimento: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .transform(trimOrNull),
    anos_atuacao: z.coerce
      .number()
      .int()
      .min(0)
      .max(120)
      .optional()
      .nullable(),
    // Fase 8 — regionais adicionais Zona da Mata
    endereco_textual: z
      .string()
      .max(255)
      .optional()
      .nullable()
      .transform(trimOrNull),
    compra_cafe_especial: z.coerce.boolean().optional(),
    volume_minimo_sacas: z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .optional()
      .nullable(),
    faz_retirada_amostra: z.coerce.boolean().optional(),
    trabalha_exportacao: z.coerce.boolean().optional(),
    trabalha_cooperativas: z.coerce.boolean().optional(),
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
  // Sprint 1 — E-mail opcional do produtor. Quando preenchido,
  // disparamos confirmação automática "seu interesse foi enviado".
  // Aceita vazio/null para preservar fluxo de quem prefere só WhatsApp.
  email: z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform(trimOrNull)
    .refine(
      (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "E-mail inválido." },
    ),
  mensagem: z
    .string()
    .max(1000, "Mensagem deve ter no máximo 1000 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
  // Qualificação regional (Sprint 2 — formulário qualificado)
  objetivo: z
    .enum(["vender", "comprar", "cotacao", "outro"])
    .optional()
    .nullable(),
  tipo_cafe: z
    .enum([
      "arabica_comum",
      "arabica_especial",
      "natural",
      "cereja_descascado",
      "ainda_nao_sei",
    ])
    .optional()
    .nullable(),
  volume_range: z
    .enum(["ate_50", "50_200", "200_500", "500_mais"])
    .optional()
    .nullable(),
  canal_preferido: z
    .enum(["whatsapp", "ligacao", "email"])
    .optional()
    .nullable(),
  // Sprint 7 — Operação física / hiper-localidade
  corrego_localidade: z
    .string()
    .max(120, "Máximo 120 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
  safra_tipo: z
    .enum(["atual", "remanescente"])
    .optional()
    .nullable(),
  // Sprint 2 Fase 2 — Campos regionais adicionais para qualificação
  // operacional do lead (tudo opcional — form público não deve pesar).
  possui_amostra: z
    .enum(["sim", "nao", "vou_colher"])
    .optional()
    .nullable(),
  possui_laudo: z
    .enum(["sim", "nao"])
    .optional()
    .nullable(),
  bebida_percebida: z
    .enum(["especial", "dura", "riada", "rio", "mole", "nao_sei"])
    .optional()
    .nullable(),
  preco_esperado_saca: z
    .number()
    .min(0, "Preço mínimo é 0.")
    .max(100000, "Preço acima do razoável — confira os dígitos.")
    .optional()
    .nullable(),
  urgencia: z
    .enum(["hoje", "semana", "mes", "sem_pressa"])
    .optional()
    .nullable(),
  observacoes: z
    .string()
    .max(1000, "Máximo 1000 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
  consentimento_contato: z
    .boolean({ required_error: "Autorize o contato para enviar." })
    .refine((v) => v === true, {
      message: "Precisamos da sua autorização para compartilhar com a corretora.",
    }),
  // Honeypot — campo invisível posicionado fora da tela no form.
  // Usuário humano nunca preenche; bot que tenta preencher tudo cai
  // aqui. Se vier qualquer coisa diferente de vazio/null, o controller
  // responde 201 silenciosamente SEM criar lead (não revelamos a trap).
  website_hp: z
    .string()
    .max(500)
    .optional()
    .nullable(),
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
    // Sprint 7 — fluxo de amostra física
    amostra_status: z
      .enum(["nao_entregue", "prometida", "recebida", "laudada"])
      .optional(),
    // Laudo operacional — classificação de café
    bebida_classificacao: z
      .enum(["especial", "dura", "riado", "rio", "escolha"])
      .optional()
      .nullable(),
    pontuacao_sca: z
      .number()
      .min(0, "Pontuação mínima é 0.")
      .max(100, "Pontuação máxima é 100.")
      .optional()
      .nullable(),
    preco_referencia_saca: z
      .number()
      .min(0)
      .optional()
      .nullable(),
    // Classificação expandida (laudo completo)
    umidade_pct: z
      .number()
      .min(0)
      .max(30, "Umidade máxima 30%.")
      .optional()
      .nullable(),
    peneira: z
      .string()
      .max(20)
      .optional()
      .nullable()
      .transform(trimOrNull),
    catacao_defeitos: z
      .string()
      .max(255)
      .optional()
      .nullable()
      .transform(trimOrNull),
    aspecto_lote: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .transform(trimOrNull),
    obs_sensoriais: z
      .string()
      .max(2000)
      .optional()
      .nullable()
      .transform(trimOrNull),
    obs_comerciais: z
      .string()
      .max(2000)
      .optional()
      .nullable()
      .transform(trimOrNull),
    mercado_indicado: z
      .enum(["exportacao", "mercado_interno", "cafeteria", "commodity", "indefinido"])
      .optional()
      .nullable(),
    aptidao_oferta: z
      .enum(["sim", "nao", "parcial"])
      .optional()
      .nullable(),
    prioridade_comercial: z
      .enum(["alta", "media", "baixa"])
      .optional()
      .nullable(),
    altitude_origem: z
      .number()
      .int()
      .min(0)
      .max(3000)
      .optional()
      .nullable(),
    variedade_cultivar: z
      .string()
      .max(80)
      .optional()
      .nullable()
      .transform(trimOrNull),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "Informe ao menos um campo para atualizar." },
  );

// ---------------------------------------------------------------------------
// Listagem de leads pela corretora
// ---------------------------------------------------------------------------

// Fase 3 — Notas datadas no detalhe do lead
// POST /api/corretora/leads/:id/notes
const createLeadNoteSchema = z.object({
  body: z
    .string({ required_error: "Texto da nota é obrigatório." })
    .min(1, "Nota vazia.")
    .max(2000, "Máximo 2000 caracteres.")
    .transform((v) => v.trim()),
});

// Fase 3 — Proposta / compra
// PATCH /api/corretora/leads/:id/proposal
const updateLeadProposalSchema = z
  .object({
    preco_proposto: z
      .number()
      .min(0, "Preço não pode ser negativo.")
      .max(100000)
      .optional()
      .nullable(),
    preco_fechado: z
      .number()
      .min(0, "Preço não pode ser negativo.")
      .max(100000)
      .optional()
      .nullable(),
    data_compra: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar em YYYY-MM-DD.")
      .optional()
      .nullable(),
    destino_venda: z
      .enum([
        "mercado_interno",
        "exportacao",
        "cooperativa",
        "revenda",
        "outro",
      ])
      .optional()
      .nullable(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "Informe ao menos um campo para atualizar." },
  );

// Fase 3 — Próxima ação (lembrete simples)
// PATCH /api/corretora/leads/:id/next-action
const updateLeadNextActionSchema = z.object({
  next_action_text: z
    .string()
    .max(255, "Máximo 255 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),
  // ISO datetime ou null para limpar. Não validamos "no futuro" — o
  // corretor pode querer registrar compromisso passado que esqueceu.
  next_action_at: z
    .string()
    .datetime({ offset: true, message: "Formato de data inválido." })
    .optional()
    .nullable(),
});

const listLeadsQuerySchema = z.object({
  status: z.enum(["new", "contacted", "closed", "lost"]).optional(),
  amostra_status: z
    .enum(["nao_entregue", "prometida", "recebida", "laudada"])
    .optional(),
  bebida_classificacao: z
    .enum(["especial", "dura", "riado", "rio", "escolha"])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Convite de primeiro acesso pelo admin
// POST /api/admin/mercado-do-cafe/corretoras/:id/users/invite
//
// Não recebe senha: o admin só informa nome e e-mail. A corretora define
// a senha ao usar o link de primeiro acesso enviado por e-mail.
// ---------------------------------------------------------------------------

const inviteCorretoraUserSchema = z.object({
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
});

// ---------------------------------------------------------------------------
// Recuperação de senha (POST /api/corretora/forgot-password e /reset-password)
// ---------------------------------------------------------------------------

// ETAPA 2 — schemas de 2FA TOTP
const confirmTotpSetupSchema = z.object({
  code: z
    .string({ required_error: "Código TOTP é obrigatório." })
    .regex(/^\d{6}$/, "Código deve ter 6 dígitos."),
});

const disableTotpSchema = z.object({
  // Exige a senha atual pra desabilitar 2FA — previne
  // usuário com cookie sequestrado desligar a proteção.
  senha: z
    .string({ required_error: "Senha atual é obrigatória." })
    .min(1),
});

const verifyTotpStepSchema = z.object({
  challenge_token: z
    .string({ required_error: "challenge_token é obrigatório." })
    .min(20),
  code: z
    .string({ required_error: "Código é obrigatório." })
    .min(4)
    .max(16),
});

const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido.")
    .max(200)
    .transform((v) => v.trim().toLowerCase()),
});

const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: "Token é obrigatório." })
    .min(32, "Token inválido.")
    .max(128, "Token inválido."),
  senha: z
    .string({ required_error: "Nova senha é obrigatória." })
    .min(8, "Senha deve ter pelo menos 8 caracteres.")
    .max(200),
});

module.exports = {
  corretoraLoginSchema,
  updateProfileSchema,
  createLeadSchema,
  updateLeadSchema,
  createLeadNoteSchema,
  updateLeadProposalSchema,
  updateLeadNextActionSchema,
  listLeadsQuerySchema,
  confirmTotpSetupSchema,
  disableTotpSchema,
  verifyTotpStepSchema,
  inviteCorretoraUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
