"use strict";
// schemas/userAddressSchemas.js
//
// Zod schemas para validação das rotas de endereços do usuário (routes/auth/userAddresses.js).
//
// AddressBodySchema   — POST /api/users/addresses  e  PUT /api/users/addresses/:id
// AddressParamSchema  — PUT  /api/users/addresses/:id  e  DELETE /api/users/addresses/:id
//
// Responsabilidade deste módulo:
//   • Validação estrutural e condicional (URBANA vs RURAL) na camada HTTP.
//   • Aliases de campo aceitos (rua|logradouro → endereco, referencia → ponto_referencia).
//   • NÃO faz transformação de dados para o banco — isso permanece em userAddressService.normalizeInput.
//
// Erros produzidos:
//   validate middleware → next(AppError("Dados inválidos.", VALIDATION_ERROR, 400, { fields }))
//   fields: [{ field, message }] — padrão único do projeto (Phase 1 — 2026-03).

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Campo de texto obrigatório não-vazio.
 * Usa z.custom() porque Zod 4 não honra required_error para campos ausentes.
 * Produz a mesma mensagem para ausente (undefined), vazio ("") e só espaços.
 */
function nonEmpty(msg) {
  return z.custom((v) => typeof v === "string" && v.trim().length > 0, msg);
}

function optionalStr() {
  return z.string().trim().optional();
}

// ---------------------------------------------------------------------------
// AddressParamSchema
// ---------------------------------------------------------------------------

/**
 * Valida que o parâmetro de rota :id é um inteiro positivo.
 * Mesma convenção de CartIdParamSchema (schemas/cartsSchemas.js).
 */
const AddressParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// AddressBodySchema
// ---------------------------------------------------------------------------

/**
 * Valida o body de POST/PUT de endereços do usuário.
 *
 * Campos obrigatórios comuns:  cep, cidade, estado
 * Condicionais URBANA:         endereco (ou rua/logradouro), bairro, numero (ou sem_numero=true)
 * Condicionais RURAL:          comunidade, observacoes_acesso (ou ponto_referencia/referencia)
 *
 * tipo_localidade é case-insensitive; qualquer valor não-"RURAL" resulta em URBANA.
 * A transformação real (aliases → campo canônico, placeholders RURAL para DB legado)
 * permanece em userAddressService.normalizeInput.
 */
const AddressBodySchema = z
  .object({
    tipo_localidade: optionalStr(),
    apelido: optionalStr(),

    // Campos comuns obrigatórios
    cep: nonEmpty("cep é obrigatório."),
    cidade: nonEmpty("cidade é obrigatória."),
    estado: nonEmpty("estado é obrigatório."),

    // Campos URBANA (validados condicionalmente em superRefine)
    endereco: optionalStr(),
    rua: optionalStr(),      // alias → endereco
    logradouro: optionalStr(), // alias → endereco
    bairro: optionalStr(),
    numero: optionalStr(),
    sem_numero: z.union([z.boolean(), z.string(), z.number()]).optional(),

    // Campos RURAL (validados condicionalmente em superRefine)
    comunidade: optionalStr(),
    observacoes_acesso: optionalStr(),
    ponto_referencia: optionalStr(), // alias de observacoes_acesso em RURAL
    referencia: optionalStr(),       // alias de observacoes_acesso em RURAL

    // Campos opcionais globais
    complemento: optionalStr(),
    telefone: optionalStr(),
    is_default: z.union([z.boolean(), z.string(), z.number()]).optional(),
  })
  .superRefine((data, ctx) => {
    // Normaliza tipo_localidade para discriminação — mesma regra do service
    const tipo =
      typeof data.tipo_localidade === "string" &&
      data.tipo_localidade.toUpperCase() === "RURAL"
        ? "RURAL"
        : "URBANA";

    if (tipo === "URBANA") {
      // endereco ou um de seus aliases deve ser não-vazio
      const hasEndereco = !!(data.endereco || data.rua || data.logradouro || "").trim();
      if (!hasEndereco) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endereco"],
          message: "endereco (ou rua/logradouro) é obrigatório para URBANA.",
        });
      }

      // bairro obrigatório
      if (!(data.bairro || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bairro"],
          message: "bairro é obrigatório para URBANA.",
        });
      }

      // numero obrigatório, a menos que sem_numero seja truthy
      const semNumero =
        data.sem_numero === true ||
        String(data.sem_numero).toLowerCase() === "true" ||
        String(data.sem_numero) === "1";
      if (!semNumero && !(data.numero || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["numero"],
          message: "numero é obrigatório para URBANA (ou use sem_numero=true).",
        });
      }
    } else {
      // RURAL — comunidade obrigatória
      if (!(data.comunidade || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["comunidade"],
          message: "comunidade é obrigatória para RURAL.",
        });
      }

      // observacoes_acesso ou um de seus aliases deve ser não-vazio
      const hasRef = !!(
        data.observacoes_acesso ||
        data.ponto_referencia ||
        data.referencia ||
        ""
      ).trim();
      if (!hasRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["observacoes_acesso"],
          message:
            "observacoes_acesso (ou ponto_referencia/referencia) é obrigatório para RURAL.",
        });
      }
    }
  });

module.exports = { AddressBodySchema, AddressParamSchema };
