"use strict";
// controllers/contatoController.js
//
// Thin HTTP adapter para mensagens de contato publico.
// Extrai dados de req, delega ao service, retorna via lib/response.js.
//
// Contrato:
//   POST /api/public/contato → { ok: true, data: { id }, message } (201)

const svc = require("../services/contatoService");
const repo = require("../repositories/contatoRepository");
const { response } = require("../lib");

const createMensagem = async (req, res, next) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const { id } = await svc.createMensagem({ ...req.body, ip });

    return response.created(
      res,
      { id },
      "Mensagem enviada com sucesso. Retornaremos em breve."
    );
  } catch (err) {
    return next(err);
  }
};

const trackEvent = async (req, res, next) => {
  try {
    const { event, value } = req.body;
    await repo.insertEvent(event, value);
    return response.ok(res);
  } catch (err) {
    return next(err);
  }
};

const MIN_MESSAGES_FOR_METRICS = 5;

const getMetrics = async (_req, res, next) => {
  try {
    const row = await repo.getPublicMetrics();
    const total = Number(row.total) || 0;

    // Nao exibe metricas com poucos dados — evita "100% com 1 msg"
    if (total < MIN_MESSAGES_FOR_METRICS) {
      return response.ok(res, null);
    }

    const respondidas = Number(row.respondidas) || 0;
    const avgMinutes = row.avg_response_minutes != null
      ? Math.round(Number(row.avg_response_minutes))
      : null;

    const taxaResposta = Math.round((respondidas / total) * 100);

    let tempoMedio = null;
    if (avgMinutes != null && avgMinutes > 0) {
      tempoMedio = avgMinutes < 60
        ? `${avgMinutes}min`
        : avgMinutes < 1440
          ? `${Math.round(avgMinutes / 60)}h`
          : `${Math.round(avgMinutes / 1440)}d`;
    }

    return response.ok(res, {
      total_mensagens: total,
      taxa_resposta: taxaResposta,
      tempo_medio: tempoMedio,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createMensagem, trackEvent, getMetrics };
