"use strict";
// controllers/colaboradoresController.js
//
// Thin HTTP adapter: extracts data from req, delegates to service,
// maps result to API response contract.
// No SQL. No business logic. No file I/O.

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/colaboradoresAdminService");

// ---------------------------------------------------------------------------
// POST /api/admin/colaboradores/public  ("Trabalhe conosco")
// ---------------------------------------------------------------------------

const createPublic = async (req, res, next) => {
  try {
    const { id } = await svc.createPublic(req.body, req.file);
    return response.created(
      res,
      { id },
      "Cadastro enviado! Você será avisado por e-mail quando seu perfil for aprovado."
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao salvar o cadastro.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/colaboradores  (admin direct create)
// ---------------------------------------------------------------------------

const create = async (req, res, next) => {
  try {
    const { id } = await svc.createAdmin(req.body, req.file);
    return response.created(res, { id }, "Colaborador cadastrado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao salvar colaborador.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/colaboradores/pending
// ---------------------------------------------------------------------------

const listPending = async (_req, res, next) => {
  try {
    const colaboradores = await svc.listPending();
    return response.ok(res, colaboradores);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar colaboradores pendentes.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/colaboradores/:id/verify
// ---------------------------------------------------------------------------

const verify = async (req, res, next) => {
  try {
    await svc.verify(req.params.id);
    return response.ok(res, null, "Colaborador verificado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao verificar colaborador.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/colaboradores/:id
// ---------------------------------------------------------------------------

const remove = async (req, res, next) => {
  try {
    await svc.remove(req.params.id);
    return response.ok(res, null, "Colaborador removido com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover colaborador.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { createPublic, create, listPending, verify, remove };
