"use strict";
// controllers/userAddressController.js
//
// Thin HTTP adapter for user address CRUD.
// Delegates all logic to userAddressService.
//
// Response contract (lib/response.js — padrão moderno):
//   GET  /      → { ok: true, data: [...] }   (200)
//   POST /      → { ok: true }                (201)
//   PUT  /:id   → { ok: true }                (200)
//   DELETE /:id → { ok: true }                (200)
// Errors are propagated via next(AppError) and rendered by the global errorHandler.

const svc = require("../services/userAddressService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

// ---------------------------------------------------------------------------
// GET /api/users/addresses
// ---------------------------------------------------------------------------

exports.list = async (req, res, next) => {
  try {
    const rows = await svc.list(req.user.id);
    return response.ok(res, rows);
  } catch (err) {
    return next(new AppError("Erro ao listar endereços.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

// ---------------------------------------------------------------------------
// POST /api/users/addresses
// ---------------------------------------------------------------------------

exports.create = async (req, res, next) => {
  try {
    await svc.create(req.user.id, req.body || {});
    return response.created(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar endereço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// PUT /api/users/addresses/:id
// ---------------------------------------------------------------------------

exports.update = async (req, res, next) => {
  try {
    await svc.update(req.user.id, Number(req.params.id), req.body || {});
    return response.ok(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar endereço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/users/addresses/:id
// ---------------------------------------------------------------------------

exports.remove = async (req, res, next) => {
  try {
    await svc.remove(req.user.id, Number(req.params.id));
    return response.ok(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover endereço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};
