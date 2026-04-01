"use strict";
// controllers/rolesController.js
//
// Thin HTTP adapter: extracts data from req, delegates to service,
// maps result to API response contract.
// No SQL. No business logic.

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/rolesAdminService");

// ---------------------------------------------------------------------------
// GET /api/admin/roles
// ---------------------------------------------------------------------------

const list = async (_req, res, next) => {
  try {
    const roles = await svc.list();
    return response.ok(res, roles);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar roles.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/roles/:id
// ---------------------------------------------------------------------------

const getById = async (req, res, next) => {
  try {
    const role = await svc.getById(req.params.id);
    return response.ok(res, role);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar role.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/roles
// ---------------------------------------------------------------------------

const create = async (req, res, next) => {
  try {
    const role = await svc.create(req.body, req.admin.id);
    return response.created(res, role, "Role criado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar role.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/roles/:id
// ---------------------------------------------------------------------------

const update = async (req, res, next) => {
  try {
    await svc.update(req.params.id, req.body, req.admin.id);
    return response.ok(res, null, "Role atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar role.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/roles/:id
// ---------------------------------------------------------------------------

const remove = async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.admin.id);
    return response.ok(res, null, "Role removido com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover role.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { list, getById, create, update, remove };
