"use strict";
// controllers/produtosController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/produtosAdminService");

const list = async (req, res, next) => {
  try {
    const produtos = await svc.listProducts();
    return response.ok(res, produtos);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar produtos.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getById = async (req, res, next) => {
  // req.params.id é coercido para number pelo ProdutoIdParamSchema.
  try {
    const produto = await svc.getProduct(req.params.id);
    return response.ok(res, produto);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const create = async (req, res, next) => {
  try {
    const id = await svc.createProduct(req.body, req.files || []);
    return response.created(res, { id }, "Produto adicionado com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao adicionar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const update = async (req, res, next) => {
  // req.params.id é coercido para number pelo ProdutoIdParamSchema.
  try {
    await svc.updateProduct(req.params.id, req.body, req.files || []);
    return response.ok(res, null, "Produto atualizado com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const remove = async (req, res, next) => {
  // req.params.id é coercido para number pelo ProdutoIdParamSchema.
  try {
    await svc.deleteProduct(req.params.id);
    return response.noContent(res);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao remover produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { list, getById, create, update, remove };
