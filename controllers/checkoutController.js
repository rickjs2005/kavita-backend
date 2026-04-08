"use strict";

const checkoutService = require("../services/checkoutService");
const { normalizeFormaPagamento } = require("../services/paymentService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const logger = require("../lib/logger");

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * POST /api/checkout
 *
 * Extracts and validates input, delegates order creation to checkoutService,
 * and maps the service result to an HTTP response.
 *
 * Shipping values (shipping_price, shipping_rule_applied, etc.) are injected
 * into req.body by recalcShippingMiddleware before this function is called.
 */
async function create(req, res, next) {
  const usuario_id = req.user?.id;

  // Auth guard — belt-and-suspenders in case middleware is bypassed in tests.
  if (!usuario_id) {
    return next(
      new AppError(
        "Você precisa estar logado para finalizar o checkout.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  const { formaPagamento, produtos } = req.body || {};

  // Secondary payment method guard — primary validation is the Zod schema in the route.
  // normalizeFormaPagamento returns "" for any unrecognised value.
  if (!normalizeFormaPagamento(formaPagamento)) {
    return next(
      new AppError(
        "Forma de pagamento inválida. Use: Pix, Boleto, Cartão (Mercado Pago) ou Prazo.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return next(
      new AppError(
        "Dados de checkout inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  try {
    const result = await checkoutService.create(usuario_id, req.body);

    // Idempotent response — order already exists for this product composition.
    if (result.idempotente) {
      return response.ok(res, {
        pedido_id: result.pedido_id,
        nota_fiscal_aviso: "Nota fiscal será entregue junto com o produto.",
        idempotente: true,
      }, "Pedido já registrado.");
    }

    return response.created(res, {
      pedido_id: result.pedido_id,
      total: result.total,
      total_sem_desconto: result.total_sem_desconto,
      desconto_total: result.desconto_total,
      cupom_aplicado: result.cupom_aplicado,
      nota_fiscal_aviso: "Nota fiscal será entregue junto com o produto.",
    }, "Pedido criado com sucesso");
  } catch (err) {
    logger.error({ err }, "checkout create error");
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro interno ao processar checkout.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

/**
 * POST /api/checkout/preview-cupom
 *
 * Validates a coupon and returns the calculated discount without creating an order.
 * Preserves the same response shape as the legacy inline route handler.
 */
async function previewCoupon(req, res, next) {
  const { codigo, produtos } = req.body || {};

  if (!codigo || !String(codigo).trim()) {
    return next(
      new AppError("Informe o código do cupom.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return next(
      new AppError(
        "Informe os produtos para calcular o cupom.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  try {
    const result = await checkoutService.previewCoupon({ codigo, produtos });
    return response.ok(res, {
      desconto: result.desconto,
      total_original: result.total_original,
      total_com_desconto: result.total_com_desconto,
      cupom: result.cupom,
    }, "Cupom aplicado com sucesso.");
  } catch (err) {
    logger.error({ err }, "checkout preview-cupom error");
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao validar o cupom.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { create, previewCoupon };
