"use strict";
// controllers/contatoController.js
//
// Thin HTTP adapter para mensagens de contato publico.
// Extrai dados de req, delega ao service, retorna via lib/response.js.
//
// Contrato:
//   POST /api/public/contato → { ok: true, data: { id }, message } (201)

const svc = require("../services/contatoService");
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

module.exports = { createMensagem };
