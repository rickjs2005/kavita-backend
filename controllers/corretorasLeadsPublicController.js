// controllers/corretorasLeadsPublicController.js
//
// Endpoint público de captura de lead (POST /api/public/corretoras/:slug/leads).
// Sem auth, mas com rate-limit por IP aplicado no nível da rota.
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const leadsService = require("../services/corretoraLeadsService");

/**
 * POST /api/public/corretoras/:slug/leads
 * Body validado por validate(createLeadSchema).
 */
async function submitLead(req, res, next) {
  try {
    const { slug } = req.params;

    // Honeypot — bot que preencheu o campo invisível cai aqui.
    // Resposta deliberadamente idêntica ao caso de sucesso para não
    // revelar a trap; o lead NÃO é criado. Log para telemetria/tuning
    // do rate-limit adaptativo.
    if (req.body?.website_hp && String(req.body.website_hp).trim() !== "") {
      require("../lib/logger").info(
        {
          slug,
          ip: req.ip,
          userAgent: req.get("user-agent")?.slice(0, 200) || null,
          honeypotValue: String(req.body.website_hp).slice(0, 80),
        },
        "corretora.lead.honeypot_trapped",
      );
      return response.created(
        res,
        { id: null },
        "Mensagem enviada! A corretora receberá seu contato em instantes.",
      );
    }

    const result = await leadsService.createLeadFromPublic({
      slug,
      data: req.body,
      meta: {
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 500) || null,
      },
    });

    const msg = result.deduplicated
      ? "Já recebemos seu contato recentemente — a corretora foi avisada de que você voltou a chamar e retorna em breve."
      : "Mensagem enviada! A corretora receberá seu contato em instantes.";
    return response.created(res, { id: result.id, deduplicated: Boolean(result.deduplicated) }, msg);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar mensagem.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

/**
 * POST /api/public/leads/:id/lote-vendido/:token
 *
 * Sprint 7 — Produtor confirma "já vendi para outra pessoa".
 * Sem auth (link único enviado ao produtor pela corretora). Token
 * HMAC valida posse legítima do link.
 */
async function confirmLoteVendido(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const token = String(req.params.token || "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError(
        "Link inválido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const result = await leadsService.confirmLoteVendidoFromPublic({
      leadId,
      token,
    });
    return response.ok(
      res,
      result,
      result.already_marked
        ? "Lote já estava marcado como vendido."
        : `Confirmação registrada. ${result.affected_count} corretora(s) notificada(s).`,
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao confirmar.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/public/leads/:id/status/:token
 *
 * Sprint 7 — Produtor consulta o próprio lead via link enviado no
 * e-mail de confirmação. Sem cookie, sem login. HMAC valida a posse
 * legítima do par (id, token).
 */
async function getLeadStatus(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const token = String(req.params.token || "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError(
        "Link inválido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const data = await leadsService.getPublicLeadStatus({ leadId, token });
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao buscar status.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { submitLead, confirmLoteVendido, getLeadStatus };
