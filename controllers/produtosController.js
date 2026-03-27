"use strict";
// controllers/produtosController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/produtosAdminService");

exports.list = async (req, res, next) => {
  try {
    const produtos = await svc.listProducts();
    return response.ok(res, produtos);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar produtos.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.getById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const produto = await svc.getProduct(id);
    return response.ok(res, produto);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.create = async (req, res, next) => {
  try {
    const id = await svc.createProduct(req.body, req.files || []);
    return response.created(res, { id }, "Produto adicionado com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao adicionar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    await svc.updateProduct(id, req.body, req.files || []);
    return response.ok(res, null, "Produto atualizado com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    await svc.deleteProduct(id);
    return response.noContent(res);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao remover produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};
