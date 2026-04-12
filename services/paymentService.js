// services/paymentService.js
"use strict";

const { Preference } = require("mercadopago");
const { getMPClient } = require("../config/mercadopago");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/paymentRepository");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza a forma de pagamento para um dos códigos canônicos:
 * "pix" | "boleto" | "prazo" | "cartao" | "" (inválido/indefinido)
 */
function normalizeFormaPagamento(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (noAccents === "pix") return "pix";
  if (noAccents === "boleto") return "boleto";
  if (noAccents === "prazo") return "prazo";
  if (noAccents === "cartao_mp" || noAccents === "cartao-mp") return "cartao";

  if (noAccents.includes("pix") || noAccents.includes("bank_transfer")) return "pix";
  if (noAccents.includes("boleto") || noAccents.includes("ticket")) return "boleto";
  if (noAccents.includes("prazo")) return "prazo";

  if (
    noAccents.includes("cartao") ||
    noAccents.includes("credito") ||
    noAccents.includes("mercadopago") ||
    noAccents === "mercadopago"
  ) {
    return "cartao";
  }

  return "";
}

/**
 * Monta o body da Preference do Mercado Pago para um pedido.
 */
function buildPreferenceBody({ total, pedidoId, formaPagamento }) {
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const tipo = normalizeFormaPagamento(formaPagamento);

  const body = {
    items: [
      {
        id: `pedido-${pedidoId}`,
        title: `Pedido #${pedidoId}`,
        quantity: 1,
        unit_price: total,
        currency_id: "BRL",
      },
    ],
    back_urls: {
      success: `${appUrl}/checkout/sucesso?pedidoId=${pedidoId}`,
      pending: `${appUrl}/checkout/pendente?pedidoId=${pedidoId}`,
      failure: `${appUrl}/checkout/erro?pedidoId=${pedidoId}`,
    },
    metadata: { pedidoId },
  };

  if (tipo === "pix") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
      ],
    };
  } else if (tipo === "boleto") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "bank_transfer" },
      ],
    };
  } else if (tipo === "cartao") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "bank_transfer" },
        { id: "ticket" },
      ],
    };
  }

  if (process.env.NODE_ENV === "production") {
    body.auto_return = "approved";
  }

  const mpWebhookUrl = process.env.MP_WEBHOOK_URL
    ? String(process.env.MP_WEBHOOK_URL).trim()
    : null;
  if (mpWebhookUrl) {
    body.notification_url = mpWebhookUrl;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Inicia o fluxo de pagamento MP para um pedido existente.
 *
 * @param {number} pedidoId
 * @param {number} userId  ID do usuário autenticado (ownership check)
 * @returns {{ preferenceId: string, init_point: string, sandbox_init_point: string }}
 * @throws {AppError}
 */
async function startPayment(pedidoId, userId) {
  const pedido = await repo.getPedidoById(pedidoId);

  // Ownership check antes de existência para não vazar informação
  if (pedido && pedido.usuario_id !== userId) {
    throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (!pedido) {
    throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const statusElegiveis = ["pendente", "falhou"];
  if (!statusElegiveis.includes(pedido.status_pagamento)) {
    throw new AppError(
      "Este pedido não pode ser pago novamente.",
      ERROR_CODES.VALIDATION_ERROR,
      409
    );
  }

  const formaPagamentoRaw = pedido.forma_pagamento || "";
  const formaPagamentoNorm = normalizeFormaPagamento(formaPagamentoRaw);

  if (formaPagamentoNorm === "prazo") {
    throw new AppError(
      "Forma de pagamento 'Prazo' não é processada pelo Mercado Pago.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
  if (!formaPagamentoNorm) {
    throw new AppError(
      "Forma de pagamento inválida/indefinida para Mercado Pago.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const total = await repo.getTotalPedido(pedidoId);
  if (total <= 0) {
    throw new AppError(
      "Não foi possível iniciar o pagamento: valor final do pedido inválido.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const preference = new Preference(getMPClient());
  const body = buildPreferenceBody({
    total,
    pedidoId,
    formaPagamento: formaPagamentoRaw,
  });

  const pref = await preference.create({ body });

  await repo.setPedidoStatusPendente(pedidoId);

  return {
    preferenceId: pref.id,
    init_point: pref.init_point,
    sandbox_init_point: pref.sandbox_init_point,
  };
}

// ---------------------------------------------------------------------------
// Payment methods CRUD
// ---------------------------------------------------------------------------

async function listActiveMethods() {
  return repo.getActiveMethods();
}

async function listAllMethods() {
  return repo.getAllMethods();
}

/**
 * @throws {AppError} VALIDATION_ERROR 400 se code ou label ausentes / duplicados
 */
async function addMethod({ code, label, description, is_active, sort_order }) {
  const codeStr = String(code || "").trim();
  const labelStr = String(label || "").trim();

  if (!codeStr || !labelStr) {
    throw new AppError("code e label são obrigatórios.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  try {
    return await repo.createMethod({
      code: codeStr,
      label: labelStr,
      description: description ?? null,
      is_active: Number(is_active) ? 1 : 0,
      sort_order: Number(sort_order) || 0,
    });
  } catch (err) {
    if (err && String(err.code || "").toLowerCase().includes("er_dup")) {
      throw new AppError("Já existe um método com esse code.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    throw err;
  }
}

/**
 * @throws {AppError} VALIDATION_ERROR 400 / NOT_FOUND 404
 */
async function editMethod(id, { code, label, description, is_active, sort_order }) {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError("id inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const fields = [];
  const values = [];

  if (code !== undefined) {
    const codeStr = String(code || "").trim();
    if (!codeStr) throw new AppError("code não pode ser vazio.", ERROR_CODES.VALIDATION_ERROR, 400);
    fields.push("code = ?");
    values.push(codeStr);
  }
  if (label !== undefined) {
    const labelStr = String(label || "").trim();
    if (!labelStr) throw new AppError("label não pode ser vazio.", ERROR_CODES.VALIDATION_ERROR, 400);
    fields.push("label = ?");
    values.push(labelStr);
  }
  if (description !== undefined) {
    fields.push("description = ?");
    values.push(description === "" ? null : description);
  }
  if (is_active !== undefined) {
    fields.push("is_active = ?");
    values.push(Number(is_active) ? 1 : 0);
  }
  if (sort_order !== undefined) {
    fields.push("sort_order = ?");
    values.push(Number(sort_order) || 0);
  }

  if (fields.length === 0) {
    throw new AppError("Nenhum campo para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const existing = await repo.findMethodById(id);
  if (!existing) {
    throw new AppError("Método não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  try {
    return await repo.updateMethodById(id, fields, values);
  } catch (err) {
    if (err && String(err.code || "").toLowerCase().includes("er_dup")) {
      throw new AppError("Já existe um método com esse code.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    throw err;
  }
}

/**
 * @throws {AppError} VALIDATION_ERROR 400 / NOT_FOUND 404
 */
async function disableMethod(id) {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError("id inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const existing = await repo.findMethodById(id);
  if (!existing) {
    throw new AppError("Método não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  await repo.softDeleteMethod(id);
}

module.exports = {
  normalizeFormaPagamento,
  buildPreferenceBody,
  startPayment,
  listActiveMethods,
  listAllMethods,
  addMethod,
  editMethod,
  disableMethod,
};
