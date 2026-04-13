"use strict";
// controllers/pedidosUserController.js
//
// Pedidos do usuário autenticado (leitura).
// Usa valores persistidos no banco — nunca recalcula totais em JS.

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/pedidosUserRepository");

const listPedidos = async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const pedidos = await repo.findByUserId(usuarioId);
    return response.ok(res, pedidos);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao listar pedidos.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const getPedidoById = async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) {
      return next(new AppError("ID do pedido inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const pedido = await repo.findByIdAndUserId(pedidoId, usuarioId);
    if (!pedido) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    const itens = await repo.findItemsByPedidoId(pedidoId);

    // Valores vindos do banco (DECIMAL) — sem recalcular em JS.
    const subtotalItens  = Number(pedido.subtotal_itens || 0);
    const totalComDesc   = Number(pedido.total_com_desconto || 0);
    const shippingPrice  = Number(pedido.shipping_price || 0);
    const desconto       = +(Math.max(subtotalItens - totalComDesc, 0)).toFixed(2);

    return response.ok(res, {
      id: pedido.id,
      usuario_id: pedido.usuario_id,
      forma_pagamento: pedido.forma_pagamento,
      status_pagamento: pedido.status_pagamento ?? null,
      status_entrega: pedido.status_entrega ?? null,
      data_pedido: pedido.data_pedido,
      endereco: pedido.endereco ?? null,
      cupom_codigo: pedido.cupom_codigo ?? null,
      subtotal: subtotalItens,
      desconto,
      shipping_price: shippingPrice,
      shipping_prazo_dias: pedido.shipping_prazo_dias ?? null,
      total: totalComDesc + shippingPrice,
      itens: itens.map((i) => ({
        id: i.id,
        produto_id: i.produto_id,
        nome: i.nome,
        preco: Number(i.preco),
        quantidade: i.quantidade,
        imagem: i.imagem,
      })),
    });
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao buscar pedido.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { listPedidos, getPedidoById };
