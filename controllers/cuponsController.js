"use strict";
// controllers/cuponsController.js
//
// Admin coupon CRUD. No service layer — minimal business logic.
// Consumer: routes/admin/adminCupons.js

const { response } = require("../lib");
const repo = require("../repositories/cuponsRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// GET /api/admin/cupons
// ---------------------------------------------------------------------------

const list = async (_req, res, next) => {
  try {
    const data = await repo.findAll();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/cupons
// ---------------------------------------------------------------------------

const create = async (req, res, next) => {
  try {
    const cupom = await repo.create(req.body);
    response.created(res, cupom);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(
        new AppError("Já existe um cupom com esse código.", ERROR_CODES.CONFLICT, 409)
      );
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/cupons/:id
// ---------------------------------------------------------------------------

const update = async (req, res, next) => {
  try {
    const cupom = await repo.update(req.params.id, req.body);
    if (!cupom) {
      throw new AppError("Cupom não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    response.ok(res, cupom);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(
        new AppError("Já existe um cupom com esse código.", ERROR_CODES.CONFLICT, 409)
      );
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/cupons/:id
// ---------------------------------------------------------------------------

const remove = async (req, res, next) => {
  try {
    const deleted = await repo.remove(req.params.id);
    if (!deleted) {
      throw new AppError("Cupom não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    response.noContent(res);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  list,
  create,
  update,
  remove,
};
