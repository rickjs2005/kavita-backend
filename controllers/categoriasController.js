"use strict";
// controllers/categoriasController.js
//
// Thin HTTP adapter: extracts data from req, delegates to service,
// maps service result to the API response contract.
// No SQL. No business logic. No if/else beyond AppError detection.

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/categoriasAdminService");

// ---------------------------------------------------------------------------
// GET /api/admin/categorias
// ---------------------------------------------------------------------------

exports.list = async (_req, res, next) => {
  try {
    const categorias = await svc.list();
    return response.ok(res, categorias);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar categorias.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/categorias
// ---------------------------------------------------------------------------

exports.create = async (req, res, next) => {
  try {
    // req.body is already validated and coerced by CreateCategorySchema
    const categoria = await svc.create(req.body);
    return response.created(res, categoria);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar categoria.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/categorias/:id
// ---------------------------------------------------------------------------

exports.update = async (req, res, next) => {
  try {
    // req.params.id is coerced to number by CategoryIdParamSchema
    const categoria = await svc.update(req.params.id, req.body);
    return response.ok(res, categoria);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar categoria.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/admin/categorias/:id/status
// ---------------------------------------------------------------------------

exports.updateStatus = async (req, res, next) => {
  try {
    // req.params.id coerced by CategoryIdParamSchema
    // req.body.is_active validated as boolean by UpdateStatusSchema
    await svc.updateStatus(req.params.id, req.body.is_active);
    return response.ok(res, null, "Status atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/categorias/:id
// ---------------------------------------------------------------------------

exports.remove = async (req, res, next) => {
  try {
    // req.params.id coerced by CategoryIdParamSchema
    await svc.remove(req.params.id);
    return response.ok(res, null, "Categoria removida com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover categoria.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};
