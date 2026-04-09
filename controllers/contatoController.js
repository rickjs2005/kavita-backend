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

module.exports = { createMensagem, trackEvent };
