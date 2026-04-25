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

const updateStatus = async (req, res, next) => {
  try {
    await svc.updateProductStatus(req.params.id, req.body.is_active);
    return response.ok(res, null, "Status do produto atualizado.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/**
 * A3 — Lista produtos com estoque baixo.
 * Aceita ?limit=N (1..200, default 50).
 * Resposta: { items, default_threshold, total }
 */
const listLowStock = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const items = await svc.listLowStock({ limit });
    return response.ok(res, {
      items,
      default_threshold: svc.DEFAULT_REORDER_POINT,
      total: items.length,
    });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao buscar produtos com estoque baixo.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

const remove = async (req, res, next) => {
  // req.params.id é coercido para number pelo ProdutoIdParamSchema.
  try {
    await svc.deleteProduct(req.params.id);
    return response.noContent(res);
  } catch (err) {
    if (err instanceof AppError) return next(err);

    // Fallback: FK violation do MySQL (ER_ROW_IS_REFERENCED_2)
    if (err.code === "ER_ROW_IS_REFERENCED_2" || err.errno === 1451) {
      return next(new AppError(
        "Não foi possível excluir o produto porque ele está vinculado a registros existentes (carrinhos, pedidos, etc.). Desative-o em vez de excluir.",
        ERROR_CODES.CONFLICT,
        409,
      ));
    }

    return next(new AppError("Erro ao remover produto.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { list, getById, create, update, updateStatus, remove, listLowStock };
