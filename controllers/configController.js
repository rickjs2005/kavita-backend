"use strict";
// controllers/configController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/configAdminService");

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await svc.getSettings();
    return response.ok(res, settings);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar configurações.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const result = await svc.updateSettings(req.body);
    return response.ok(res, result);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar configurações.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.listCategories = async (req, res, next) => {
  try {
    const lista = await svc.listCategories();
    return response.ok(res, lista);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao listar categorias.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.createCategory = async (req, res, next) => {
  try {
    const result = await svc.createCategory(req.body);
    return response.created(res, result);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao criar categoria.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.updateCategory = async (req, res, next) => {
  // req.params.id é coercido para number pelo CategoryIdParamSchema.
  try {
    await svc.updateCategory(req.params.id, req.body);
    return response.ok(res, null, "Categoria atualizada.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar categoria.", ERROR_CODES.SERVER_ERROR, 500));
  }
};
