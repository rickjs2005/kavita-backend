"use strict";
// controllers/cartController.js
// =============================================================================
// ⚠️  CONTRATO CONGELADO — NÃO USE COMO REFERÊNCIA PARA CÓDIGO NOVO
// =============================================================================
// Este controller retorna { success: true, ... } em mutações e bare object no
// GET — ambos DIVERGENTES do padrão oficial { ok: true, data }.
// O frontend depende desses shapes exatos.
//
// Ao tocar este arquivo:
//   - PRESERVE o formato de resposta exato (success, code "STOCK_LIMIT", etc.)
//   - NÃO copie este padrão em código novo
//   - Para migrar: coordenar com frontend antes (ver CLAUDE.md § Contratos)
//
// Shapes congelados:
//   GET  /api/cart           → { carrinho_id, items: [...] }
//   POST /api/cart/items     → { success: true, produto_id, quantidade, stock, message }
//   PATCH /api/cart/items    → { success: true, produto_id, quantidade, stock, message }
//   DELETE /api/cart/items/X → { success: true, message }
//   DELETE /api/cart         → { success: true, message }
//   409 (estoque)            → { code: "STOCK_LIMIT", message, max, current, requested }
// =============================================================================

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const cartService = require("../services/cartService");

// ---------------------------------------------------------------------------
// Internal helpers
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

function getAuthenticatedUserId(req, res) {
  if (!req.user?.id) {
    res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado.",
    });
    return null;
  }

  return req.user.id;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const getCart = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const result = await cartService.getCart(userId);
    return res.json(result);
  } catch (e) {
    console.error("GET /api/cart erro:", e);
    return next(new AppError("Erro ao carregar carrinho.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const addItem = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  const { produto_id, quantidade } = req.body;

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

const updateItem = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  const { produto_id, quantidade } = req.body;

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

const removeItem = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

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

const clearCart = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

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

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };