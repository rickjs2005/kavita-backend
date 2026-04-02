"use strict";
// controllers/cartController.js
//
// Handlers do carrinho de compras do usuário.
// Todos os endpoints usam Formato A: { ok: true, data?, message? }
// Erros via next(new AppError(...)).
//
// Consumer: routes/ecommerce/cart.js

const { response } = require("../lib");
const cartService = require("../services/cartService");

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const getCart = async (req, res, next) => {
  try {
    const data = await cartService.getCart(req.user.id);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  const { produto_id, quantidade } = req.body;

  try {
    const result = await cartService.addItem(req.user.id, { produto_id, quantidade });
    response.ok(res, result, "Produto adicionado ao carrinho.");
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  const { produto_id, quantidade } = req.body;

  try {
    const result = await cartService.updateItem(req.user.id, { produto_id, quantidade });
    const msg = result.emptyCart ? "Carrinho já vazio." : "Quantidade atualizada.";
    response.ok(res, result, msg);
  } catch (err) {
    next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const result = await cartService.removeItem(req.user.id, req.params.produtoId);
    const msg = result.removed ? "Item removido do carrinho." : "Carrinho já vazio.";
    response.ok(res, null, msg);
  } catch (err) {
    next(err);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const result = await cartService.clearCart(req.user.id);
    const msg = result.cleared ? "Carrinho limpo." : "Carrinho já estava vazio.";
    response.ok(res, null, msg);
  } catch (err) {
    next(err);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
