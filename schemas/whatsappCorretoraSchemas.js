"use strict";

// schemas/whatsappCorretoraSchemas.js — Etapa 5 (painel da corretora).

const { z } = require("zod");

const POSITIVE_INT = z.coerce.number().int().positive();
const OPTIONAL_POSITIVE_INT = POSITIVE_INT.optional().nullable();
const OPTIONAL_LIMIT = z.coerce.number().int().min(1).max(200).optional();
const OPTIONAL_OFFSET = z.coerce.number().int().min(0).optional();

// GET /api/corretora/whatsapp/messages
const listMessagesQuery = z.object({
  lead_id: OPTIONAL_POSITIVE_INT,
  contract_id: OPTIONAL_POSITIVE_INT,
  limit: OPTIONAL_LIMIT,
  offset: OPTIONAL_OFFSET,
});

// GET /api/corretora/whatsapp/inbound
const listInboundQuery = z.object({
  limit: OPTIONAL_LIMIT,
  offset: OPTIONAL_OFFSET,
});

// POST /api/corretora/whatsapp/send
const sendMessageBody = z.object({
  key: z.string().trim().min(1, "key obrigatória."),
  variables: z.record(z.string(), z.string().or(z.number())).optional(),
  to: z.string().trim().min(8, "telefone obrigatório."),
  lead_id: OPTIONAL_POSITIVE_INT,
  contract_id: OPTIONAL_POSITIVE_INT,
  language_code: z.string().trim().min(2).max(10).optional(),
});

module.exports = {
  listMessagesQuery,
  listInboundQuery,
  sendMessageBody,
};
