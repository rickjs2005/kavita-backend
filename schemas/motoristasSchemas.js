"use strict";
const { z } = require("zod");

const trimOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const createMotoristaSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto.").max(120),
  telefone: z.string().trim().min(10, "Telefone invalido.").max(20),
  email: z.string().email("E-mail invalido.").max(160).optional().nullable().transform(trimOrNull),
  veiculo_padrao: z.string().max(60).optional().nullable().transform(trimOrNull),
});

const updateMotoristaSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  telefone: z.string().trim().min(10).max(20).optional(),
  email: z.string().email().max(160).optional().nullable().transform(trimOrNull),
  veiculo_padrao: z.string().max(60).optional().nullable().transform(trimOrNull),
});

const setAtivoSchema = z.object({
  ativo: z.boolean(),
});

const enviarLinkSchema = z.object({
  // sem campos obrigatorios — id da rota vem do path
}).optional().nullable();

const requestMagicLinkSchema = z.object({
  telefone: z.string().trim().min(10).max(20),
});

const consumeMagicLinkSchema = z.object({
  token: z.string().min(10),
});

module.exports = {
  createMotoristaSchema,
  updateMotoristaSchema,
  setAtivoSchema,
  enviarLinkSchema,
  requestMagicLinkSchema,
  consumeMagicLinkSchema,
};
