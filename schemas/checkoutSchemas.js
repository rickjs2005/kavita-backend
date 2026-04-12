// schemas/checkoutSchemas.js
// Zod schema for POST /api/checkout body validation.
// Owns both normalization (field aliases, S/N number) and conditional rules
// (ENTREGA vs RETIRADA, URBANA vs RURAL).
// Applied via validate(checkoutBodySchema) in checkoutRoutes.js.

"use strict";

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Internal normalizers — private to this module
// Mirror the logic that was inline in checkoutRoutes.js/validateCheckoutBody.
// ---------------------------------------------------------------------------

function _asStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function _upper(v, fallback = "") {
  return (_asStr(v) || fallback).toUpperCase();
}

/**
 * Normalizes the endereco object before validation:
 * - Resolves field aliases: rua|endereco|logradouro, ponto_referencia|referencia|complemento
 * - Normalizes tipo_localidade (default URBANA)
 * - Normalizes estado to uppercase
 * - Applies "S/N" when sem_numero=true and numero is absent
 *
 * Spreads the original object so that unknown fields (complemento etc.) are preserved.
 */
function _normalizeEndereco(raw) {
  const e = raw && typeof raw === "object" ? raw : {};
  const tipo_localidade = _upper(e.tipo_localidade) === "RURAL" ? "RURAL" : "URBANA";
  const rua = _asStr(e.rua) || _asStr(e.endereco) || _asStr(e.logradouro);
  const ponto_referencia =
    _asStr(e.ponto_referencia) || _asStr(e.referencia) || _asStr(e.complemento);
  const sem_numero =
    e.sem_numero === true ||
    _upper(e.sem_numero) === "TRUE" ||
    _upper(e.sem_numero) === "1";
  const numero = sem_numero && !_asStr(e.numero) ? "S/N" : _asStr(e.numero);

  return {
    ...e,
    cep: _asStr(e.cep),
    cidade: _asStr(e.cidade),
    estado: _upper(e.estado),
    tipo_localidade,
    rua,
    bairro: _asStr(e.bairro),
    numero,
    sem_numero,
    ponto_referencia,
    observacoes_acesso: _asStr(e.observacoes_acesso),
    comunidade: _asStr(e.comunidade),
  };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes the POST /api/checkout request body.
 *
 * Normalization (z.preprocess — runs before shape validation):
 *   - entrega_tipo coerced to "ENTREGA" | "RETIRADA" (default "ENTREGA")
 *   - endereco field aliases resolved, estado uppercased, sem_numero → "S/N"
 *
 * Shape validation (z.object):
 *   - formaPagamento: required non-empty string
 *   - produtos: array of { id, quantidade } — both coerced to int
 *   - cupom_codigo, nome, cpf, telefone: optional strings
 *
 * Conditional rules (superRefine — runs after shape validation):
 *   ENTREGA:
 *     - endereco required; cep, cidade, estado required
 *     - URBANA: rua, bairro, numero (or sem_numero) required
 *     - RURAL:  comunidade + observacoes_acesso (or ponto_referencia) required
 *   RETIRADA:
 *     - endereco optional; normalized when present
 *
 * The parsed output (result.data) replaces req.body via middleware/validate.js.
 */
const checkoutBodySchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const body = { ...raw };
    // Normalize entrega_tipo before the rest of the schema runs
    body.entrega_tipo = _upper(body.entrega_tipo) === "RETIRADA" ? "RETIRADA" : "ENTREGA";
    // Normalize endereco aliases / sem_numero when present
    if (body.endereco && typeof body.endereco === "object") {
      body.endereco = _normalizeEndereco(body.endereco);
    }
    return body;
  },
  z
    .object({
      entrega_tipo: z.enum(["ENTREGA", "RETIRADA"]),

      formaPagamento: z.string().trim().min(1, "formaPagamento é obrigatório"),

      produtos: z
        .array(
          z.object({
            id: z.preprocess(
              (v) => Number(v),
              z.number().int().positive("produtos[].id inválido")
            ),
            quantidade: z.preprocess(
              (v) => Number(v),
              z.number().int().positive("produtos[].quantidade deve ser maior que zero")
            ),
          })
        )
        .min(1, "produtos deve ter ao menos um item"),

      // Normalized by z.preprocess above; validated conditionally by superRefine.
      endereco: z.any().optional(),

      cupom_codigo: z.string().trim().nullish(),
      nome: z.string().trim().optional(),
      email: z.string().trim().email("Formato de e-mail inválido.").optional().or(z.literal("")),
      cpf: z.string().trim().optional(),
      telefone: z.string().trim().optional(),
    })
    .superRefine((body, ctx) => {
      // RETIRADA: endereco is optional — nothing more to validate here
      if (body.entrega_tipo !== "ENTREGA") return;

      if (!body.endereco) {
        ctx.addIssue({
          path: ["endereco"],
          message: "endereco é obrigatório quando entrega_tipo = ENTREGA",
          code: "custom",
        });
        return; // no point checking fields of a missing object
      }

      const e = body.endereco;

      if (!e.cep)
        ctx.addIssue({
          path: ["endereco", "cep"],
          message: "endereco.cep é obrigatório",
          code: "custom",
        });

      if (!e.cidade)
        ctx.addIssue({
          path: ["endereco", "cidade"],
          message: "endereco.cidade é obrigatório",
          code: "custom",
        });

      if (!e.estado)
        ctx.addIssue({
          path: ["endereco", "estado"],
          message: "endereco.estado é obrigatório",
          code: "custom",
        });

      if (e.tipo_localidade === "URBANA") {
        if (!e.rua)
          ctx.addIssue({
            path: ["endereco", "rua"],
            message: "endereco.rua é obrigatório",
            code: "custom",
          });

        if (!e.bairro)
          ctx.addIssue({
            path: ["endereco", "bairro"],
            message: "endereco.bairro é obrigatório",
            code: "custom",
          });

        if (!e.sem_numero && !e.numero)
          ctx.addIssue({
            path: ["endereco", "numero"],
            message: "endereco.numero é obrigatório",
            code: "custom",
          });
      } else if (e.tipo_localidade === "RURAL") {
        if (!e.comunidade)
          ctx.addIssue({
            path: ["endereco", "comunidade"],
            message: "endereco.comunidade é obrigatório quando tipo_localidade = RURAL",
            code: "custom",
          });

        if (!e.observacoes_acesso && !e.ponto_referencia)
          ctx.addIssue({
            path: ["endereco", "observacoes_acesso"],
            message:
              "endereco.observacoes_acesso (ou ponto_referencia) é obrigatório quando tipo_localidade = RURAL",
            code: "custom",
          });
      }
    })
);

module.exports = { checkoutBodySchema };
