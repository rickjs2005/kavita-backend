"use strict";

// controllers/corretoraPanel/whatsappCorretoraController.js — Etapa 5
// (ver docs/whatsapp-reativacao.md secao 10).
//
// Endpoints do painel autenticado da corretora para operar mensagens
// WhatsApp:
//   - GET /messages   lista enviadas (opcional filtro lead/contract)
//   - GET /inbound    lista recebidas
//   - POST /send      dispara template para um lead/contrato
//
// Auth: o middleware verifyCorretora ja preencheu req.corretoraUser
// com { id, corretora_id, role }. Nunca confiamos em corretora_id
// vindo do body — sempre da sessao.

const repo = require("../../repositories/whatsappRepository");
const whatsappService = require("../../services/whatsapp/whatsappService");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

function getCorretoraIdFromSession(req) {
  // verifyCorretora preenche req.corretoraUser; cobrir variantes
  // defensivas (req.user) vistas em outros controllers do painel.
  return (
    req.corretoraUser?.corretora_id ??
    req.user?.corretora_id ??
    null
  );
}

async function listMessages(req, res, next) {
  try {
    const corretoraId = getCorretoraIdFromSession(req);
    if (!corretoraId) {
      throw new AppError(
        "Sessão de corretora ausente.",
        ERROR_CODES.UNAUTHORIZED,
        401,
      );
    }

    const { lead_id, contract_id, limit, offset } = req.query;
    const rows = await repo.listMessagesForCorretora(corretoraId, {
      leadId: lead_id ?? null,
      contractId: contract_id ?? null,
      limit,
      offset,
    });
    return response.ok(res, rows, null, {
      count: rows.length,
      filters: {
        lead_id: lead_id ?? null,
        contract_id: contract_id ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listInbound(req, res, next) {
  try {
    const corretoraId = getCorretoraIdFromSession(req);
    if (!corretoraId) {
      throw new AppError(
        "Sessão de corretora ausente.",
        ERROR_CODES.UNAUTHORIZED,
        401,
      );
    }

    const { limit, offset } = req.query;
    const rows = await repo.listInboundForCorretora(corretoraId, {
      limit,
      offset,
    });
    return response.ok(res, rows, null, { count: rows.length });
  } catch (err) {
    return next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const corretoraId = getCorretoraIdFromSession(req);
    if (!corretoraId) {
      throw new AppError(
        "Sessão de corretora ausente.",
        ERROR_CODES.UNAUTHORIZED,
        401,
      );
    }

    const { key, variables = {}, to, lead_id, contract_id, language_code } =
      req.body;

    const result = await whatsappService.sendMessage({
      key,
      variables,
      to,
      lead_id: lead_id ?? null,
      contract_id: contract_id ?? null,
      // corretora_id sempre da sessao — nunca do body.
      corretora_id: corretoraId,
      language_code: language_code ?? null,
    });

    if (!result.ok) {
      const status =
        result.code === ERROR_CODES.VALIDATION_ERROR
          ? 400
          : result.code === ERROR_CODES.NOT_FOUND
            ? 404
            : result.code === ERROR_CODES.CONFLICT
              ? 409
              : 500;
      throw new AppError(result.message, result.code, status, {
        message_id: result.message_id ?? null,
        status: result.status ?? null,
      });
    }

    return response.ok(res, {
      message_id: result.message_id,
      status: result.status,
      provider: result.provider,
      provider_message_id: result.provider_message_id,
      language_code: result.language_code,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listMessages, listInbound, sendMessage };
