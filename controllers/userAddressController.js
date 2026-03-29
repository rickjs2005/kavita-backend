"use strict";
// controllers/userAddressController.js
//
// Thin HTTP adapter for user address CRUD.
// Delegates all logic to userAddressService.
//
// Response contract note — preserved from legacy for frontend compatibility:
//   GET  /      → raw JSON array      (not { ok, data })
//   POST /      → { success: true }   (201)
//   PUT  /:id   → { success: true }   (200)
//   DELETE /:id → { success: true }   (200)
// Errors are propagated via next(AppError) and rendered by the global errorHandler.
// Migration to lib/response.js requires a coordinated frontend release.

const svc = require("../services/userAddressService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// GET /api/users/addresses
// ---------------------------------------------------------------------------

exports.list = async (req, res, next) => {
  try {
    const rows = await svc.list(req.user.id);
    return res.json(rows);
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
    return res.status(201).json({ success: true });
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
    return res.json({ success: true });
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
    return res.json({ success: true });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover endereço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};
