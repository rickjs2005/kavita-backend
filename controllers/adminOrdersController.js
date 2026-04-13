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
const { parseAddress } = require("../utils/address");

// ---------------------------------------------------------------------------
// Formatting helpers — presentation layer, private to this controller.
// Transforms raw DB rows into the HTTP response shape.
// ---------------------------------------------------------------------------

const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

const formatCep = (cep) => {
  const d = onlyDigits(cep);
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return cep;
};

const normalizeEndereco = (endereco) => {
  if (!endereco || typeof endereco !== "object") return endereco;
  if (!("cep" in endereco)) return endereco;
  return { ...endereco, cep: formatCep(endereco.cep) };
};

function formatOrder(row, itens) {
  return {
    id: row.pedido_id,
    usuario_id: row.usuario_id,
    usuario: row.usuario_nome,
    email: row.usuario_email ?? null,
    telefone: row.usuario_telefone ?? null,
    cpf: row.usuario_cpf ?? null,
    endereco: normalizeEndereco(parseAddress(row.endereco)),
    forma_pagamento: row.forma_pagamento,
    status_pagamento: row.status_pagamento,
    status_entrega: row.status_entrega,
    total: Number(row.total ?? 0) + Number(row.shipping_price ?? 0),
    shipping_price: Number(row.shipping_price ?? 0),
    data_pedido: row.data_pedido,
    itens: itens.map((i) => ({
      produto: i.produto_nome,
      quantidade: i.quantidade,
      preco_unitario: Number(i.preco_unitario),
    })),
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function listOrders(req, res, next) {
  try {
    const { pedidos, itens } = await orderService.listOrders();
    const data = pedidos.map((p) =>
      formatOrder(p, itens.filter((i) => i.pedido_id === p.pedido_id))
    );
    return response.ok(res, data);
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
    const result = await orderService.getOrderById(req.params.id);
    if (!result) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }
    return response.ok(res, formatOrder(result.pedido, result.itens));
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

// ---------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------

const ocorrenciasRepo = require("../repositories/pedidoOcorrenciasRepository");

async function listOcorrencias(req, res, next) {
  try {
    const rows = await ocorrenciasRepo.findAllOpen();
    return response.ok(res, rows);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar ocorrências.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

async function updateOcorrencia(req, res, next) {
  try {
    const id = Number(req.params.ocorrenciaId);
    if (!id) {
      return next(new AppError("ID da ocorrência inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const existing = await ocorrenciasRepo.findById(id);
    if (!existing) {
      return next(new AppError("Ocorrência não encontrada.", ERROR_CODES.NOT_FOUND, 404));
    }

    const { status, resposta_admin, taxa_extra } = req.body;

    await ocorrenciasRepo.updateByAdmin(id, {
      status,
      respostaAdmin: resposta_admin,
      taxaExtra: taxa_extra,
    });

    return response.ok(res, null, "Ocorrência atualizada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar ocorrência.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

module.exports = {
  listOrders,
  getOrderById,
  updatePaymentStatus,
  updateDeliveryStatus,
  listOcorrencias,
  updateOcorrencia,
};
