"use strict";
// controllers/cartController.js
//
// Handlers do carrinho do usuário autenticado.
// Contrato de resposta atual: { success: true, ... } — divergente do padrão { ok: true }.
// NÃO alterar o formato de resposta sem alinhar com o frontend.
// Ver CLAUDE.md § "Contratos divergentes em módulos não-legados".

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const cartService = require("../services/cartService");

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function sendStockLimit(res, err) {
  return res.status(409).json({
    code: "STOCK_LIMIT",
    message: err.message,
    max: err.meta?.max ?? null,
    current: err.meta?.current ?? null,
    requested: err.meta?.requested ?? null,
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

exports.getCart = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await cartService.getCart(userId);
    return res.json(result);
  } catch (e) {
    console.error("GET /api/cart erro:", e);
    return next(new AppError("Erro ao carregar carrinho.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.addItem = async (req, res, next) => {
  const { produto_id, quantidade } = req.body;
  const userId = req.user.id;

  try {
    const result = await cartService.addItem(userId, { produto_id, quantidade });
    return res.status(200).json({
      success: true,
      message: "Produto adicionado ao carrinho",
      produto_id: result.produto_id,
      quantidade: result.quantidade,
      stock: result.stock,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "STOCK_LIMIT") return sendStockLimit(res, e);
    console.error("POST /api/cart/items erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao adicionar item ao carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

exports.updateItem = async (req, res, next) => {
  const { produto_id, quantidade } = req.body;
  const userId = req.user.id;

  try {
    const result = await cartService.updateItem(userId, { produto_id, quantidade });
    return res.status(200).json({
      success: true,
      message: result.emptyCart ? "Carrinho já vazio." : "Quantidade atualizada.",
      produto_id: result.produto_id,
      quantidade: result.quantidade,
      stock: result.stock,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "STOCK_LIMIT") return sendStockLimit(res, e);
    console.error("PATCH /api/cart/items erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao atualizar item do carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

exports.removeItem = async (req, res, next) => {
  const userId = req.user.id;
  const produtoId = req.params.produtoId;

  try {
    const result = await cartService.removeItem(userId, produtoId);
    return res.json({
      success: true,
      message: result.removed ? "Item removido do carrinho." : "Carrinho já vazio.",
    });
  } catch (e) {
    console.error("DELETE /api/cart/items/:produtoId erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao remover item do carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

exports.clearCart = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await cartService.clearCart(userId);
    return res.json({
      success: true,
      message: result.cleared ? "Carrinho limpo." : "Carrinho já estava vazio.",
    });
  } catch (e) {
    console.error("DELETE /api/cart erro:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao limpar carrinho.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};
