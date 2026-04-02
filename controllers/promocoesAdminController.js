"use strict";
// controllers/promocoesAdminController.js
//
// Admin product promotions CRUD.
// Consumer: routes/admin/adminMarketingPromocoes.js

const { response } = require("../lib");
const repo = require("../repositories/promocoesAdminRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// GET /api/admin/marketing/promocoes
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
// POST /api/admin/marketing/promocoes
// ---------------------------------------------------------------------------

const create = async (req, res, next) => {
  try {
    const { product_id } = req.body;

    if (!(await repo.productExists(product_id))) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    if (await repo.promoExistsForProduct(product_id)) {
      throw new AppError(
        "Já existe uma promoção para este produto.",
        ERROR_CODES.CONFLICT,
        409
      );
    }

    await repo.create(req.body);
    response.created(res, null, "Promoção criada com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/marketing/promocoes/:id
// ---------------------------------------------------------------------------

const update = async (req, res, next) => {
  try {
    if (!(await repo.findById(req.params.id))) {
      throw new AppError("Promoção não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }

    await repo.update(req.params.id, req.body);
    response.ok(res, null, "Promoção atualizada com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/marketing/promocoes/:id
// ---------------------------------------------------------------------------

const remove = async (req, res, next) => {
  try {
    const deleted = await repo.remove(req.params.id);
    if (!deleted) {
      throw new AppError("Promoção não encontrada.", ERROR_CODES.NOT_FOUND, 404);
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
