"use strict";
// controllers/promocoesPublicController.js
//
// Thin HTTP adapter para o módulo público de promoções.
// Extrai dados de req, delega ao service, retorna via lib/response.js.
//
// Contrato de resposta (migrado de _legacy/publicPromocoes.js):
//   GET /            → { ok: true, data: [...] }
//   GET /:productId  → { ok: true, data: { ...promocao } }
//
// ⚠️  MUDANÇA DE CONTRATO vs legado:
//   GET /           legado: array direto
//   GET /           novo:   { ok: true, data: [...] }
//
//   GET /:productId legado: objeto direto / { message: "..." } para erros
//   GET /:productId novo:   { ok: true, data: {...} } / AppError padronizado

const svc = require("../services/promocoesService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

// ---------------------------------------------------------------------------
// GET /api/public/promocoes
// ---------------------------------------------------------------------------

const listPromocoes = async (_req, res, next) => {
  try {
    const data = await svc.listPromocoes();
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar promoções.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/promocoes/:productId
// ---------------------------------------------------------------------------

const getPromocao = async (req, res, next) => {
  try {
    const data = await svc.getPromocaoByProductId(req.params.productId);
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao buscar promoção do produto.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

module.exports = { listPromocoes, getPromocao };
