// controllers/adminOrdersController.js
//
// Handlers para o módulo de pedidos do painel admin.
// Delegam inteiramente ao orderService — sem SQL, sem lógica de negócio aqui.
//
// ⚠️  MUDANÇA DE CONTRATO (2026-04) — requer atualização no admin frontend:
//
//   GET /api/admin/pedidos         antes: Array<Pedido> (bare array)
//                                  agora: { ok: true, data: Array<Pedido> }
//
//   GET /api/admin/pedidos/:id     antes: Pedido (bare object)
//                                  agora: { ok: true, data: Pedido }
//
//   PUT /:id/pagamento             antes: { message: "..." }
//                                  agora: { ok: true, message: "..." }
//
//   PUT /:id/entrega               antes: { message: "..." }
//                                  agora: { ok: true, message: "..." }
//
//   Erros 4xx/5xx                  antes: inline { ok: false, code, message }
//                                  agora: errorHandler padrão { ok: false, code, message }
//                                  (mesmo shape, agora via pipeline global)

"use strict";

const orderService = require("../services/orderService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

async function listOrders(req, res, next) {
  try {
    const pedidos = await orderService.listOrders();
    return response.ok(res, pedidos);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar pedidos.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

async function getOrderById(req, res, next) {
  try {
    const pedido = await orderService.getOrderById(req.params.id);
    if (!pedido) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }
    return response.ok(res, pedido);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar pedido.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

async function updatePaymentStatus(req, res, next) {
  const { status_pagamento } = req.body;
  try {
    const result = await orderService.updatePaymentStatus(req.params.id, status_pagamento);
    if (!result.found) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }
    return response.ok(res, null, "Status de pagamento atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar status de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

async function updateDeliveryStatus(req, res, next) {
  const { status_entrega } = req.body;
  try {
    const result = await orderService.updateDeliveryStatus(req.params.id, status_entrega);
    if (!result.found) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }
    return response.ok(res, null, "Status de entrega atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar status de entrega.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

module.exports = { listOrders, getOrderById, updatePaymentStatus, updateDeliveryStatus };
