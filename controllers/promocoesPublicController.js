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
//
// Sem promoção ativa NÃO É erro — e' estado valido. Retornamos 200 + data:null
// em vez de 404 pra evitar:
//   - Poluicao de console no frontend (browser loga 404 vermelho mesmo
//     que o app trate como esperado)
//   - SWR/cache no client tratando como erro vs sucesso
//   - Apps externos achando que produto nao existe (404 e' ambiguo:
//     "produto X nao existe" vs "produto X existe sem promo")
//
// Outros codigos (500, etc) continuam erro real.
// ---------------------------------------------------------------------------

const getPromocao = async (req, res, next) => {
  try {
    const data = await svc.getPromocaoByProductId(req.params.productId);
    return response.ok(res, data);
  } catch (err) {
    // "Sem promocao" -> 200 + null. Forca campo data:null no envelope
    // (response.ok omite data quando null — aqui precisamos explicito
    // pra o apiClient unwrap retornar null e nao o envelope).
    if (err instanceof AppError && err.code === ERROR_CODES.NOT_FOUND) {
      return res.status(200).json({ ok: true, data: null });
    }
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
