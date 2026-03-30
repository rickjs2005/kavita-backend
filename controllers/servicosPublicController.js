"use strict";
// controllers/servicosPublicController.js
//
// Thin HTTP adapter para o módulo público de serviços.
// Extrai dados de req, delega ao service, retorna via lib/response.js.
//
// Contrato de resposta (Phase 1 — 2026-03):
//   GET  /            → { ok: true, data: [...], meta: { total, page, limit, pages, sort, order } }
//   GET  /:id         → { ok: true, data: { ...servico } }
//   POST /solicitacoes      → { ok: true, data: { id }, message }  (201)
//   POST /avaliacoes        → { ok: true, data: { id }, message }  (201)
//   GET  /:id/avaliacoes    → { ok: true, data: [...] }
//   POST /:id/view          → { ok: true }
//   POST /:id/whatsapp      → { ok: true }
//   POST /trabalhe-conosco  → { ok: true, data: { id }, message }  (201)
//
// ⚠️  MUDANÇA DE CONTRATO vs legado — ver documentação de migração:
//   GET /  legado: { data, page, limit, total, totalPages, sort, order }
//   GET /  novo:   { ok: true, data, meta: { total, page, limit, pages, sort, order } }
//
//   GET /:id  legado: objeto direto no body
//   GET /:id  novo:   { ok: true, data: {...} }
//
//   GET /:id/avaliacoes  legado: array direto
//   GET /:id/avaliacoes  novo:   { ok: true, data: [...] }
//
//   POST * legado: { id, message }
//   POST * novo:   { ok: true, data: { id }, message }

const svc = require("../services/servicosService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

// ---------------------------------------------------------------------------
// GET /api/public/servicos
// ---------------------------------------------------------------------------

exports.listServicos = async (req, res, next) => {
  try {
    const { data, page, limit, total, sort, order } =
      await svc.listServicos(req.query);

    return response.ok(res, data, null, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      sort,
      order: order.toLowerCase(),
    });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar serviços.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/servicos/:id
// ---------------------------------------------------------------------------

exports.getServico = async (req, res, next) => {
  try {
    const servico = await svc.getServico(req.params.id);
    return response.ok(res, servico);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao obter serviço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/servicos/solicitacoes
// ---------------------------------------------------------------------------

exports.createSolicitacao = async (req, res, next) => {
  try {
    const result = await svc.createSolicitacao(req.body);
    return response.created(res, result, "Solicitação criada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao criar solicitação de serviço.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/servicos/avaliacoes
// ---------------------------------------------------------------------------

exports.createAvaliacao = async (req, res, next) => {
  try {
    const result = await svc.createAvaliacao(req.body);
    return response.created(res, result, "Avaliação registrada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao criar avaliação de serviço.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/servicos/:id/avaliacoes
// ---------------------------------------------------------------------------

exports.listAvaliacoes = async (req, res, next) => {
  try {
    const rows = await svc.listAvaliacoes(req.params.id);
    return response.ok(res, rows);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar avaliações.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/servicos/:id/view
// ---------------------------------------------------------------------------

exports.registerView = async (req, res, next) => {
  try {
    await svc.registerView(req.params.id);
    return response.ok(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao registrar visualização.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/servicos/:id/whatsapp
// ---------------------------------------------------------------------------

exports.registerWhatsappClick = async (req, res, next) => {
  try {
    await svc.registerWhatsappClick(req.params.id);
    return response.ok(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao registrar clique no WhatsApp.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/servicos/trabalhe-conosco
// ---------------------------------------------------------------------------

exports.createTrabalheConosco = async (req, res, next) => {
  try {
    const result = await svc.createTrabalheConosco(req.body);
    return response.created(
      res,
      result,
      "Cadastro recebido! Em breve entraremos em contato."
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao receber cadastro.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};
