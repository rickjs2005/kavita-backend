"use strict";
// middleware/recalcShipping.js
//
// Middleware de recálculo de frete no checkout.
// Deve ser aplicado APÓS validate(checkoutBodySchema) e ANTES do controller.
//
// Responsabilidades:
//   - ENTREGA: recalcula frete usando o mesmo motor de /api/shipping/quote.
//     Nunca confia no valor enviado pelo frontend.
//   - RETIRADA: força shipping_price=0 e sem prazo.
//   - Injeta req.body.shipping_* para o controller persistir na transação.
//   - Armazena req.__shippingCalc (debug e rastreabilidade interna).

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { getQuote, parseCep, normalizeItems } = require("../services/shippingQuoteService");

async function recalcShipping(req, _res, next) {
  try {
    const body = req.body || {};
    // entrega_tipo is already normalized by checkoutBodySchema — defensive re-check
    const tipo = String(body.entrega_tipo || "").trim().toUpperCase();
    const entregaTipo = tipo === "RETIRADA" ? "RETIRADA" : "ENTREGA";

    // RETIRADA: sem frete e sem prazo
    if (entregaTipo === "RETIRADA") {
      req.body.shipping_price = 0;
      req.body.shipping_rule_applied = "PICKUP";
      req.body.shipping_prazo_dias = null;
      req.body.shipping_cep = null;

      req.__shippingCalc = {
        shipping_price: 0,
        shipping_rule_applied: "PICKUP",
        shipping_prazo_dias: null,
        shipping_cep: null,
        freeItems: [],
        entrega_tipo: "RETIRADA",
      };

      return next();
    }

    // ENTREGA (padrão)
    const { endereco, produtos } = body;

    const cep = parseCep(endereco?.cep);
    if (!cep || cep.length !== 8) {
      throw new AppError(
        "CEP inválido para cálculo do frete.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Normaliza itens para o formato do service
    const items = normalizeItems(
      (produtos || []).map((p) => ({
        id: Number(p.id),
        quantidade: Number(p.quantidade),
      }))
    );

    if (!items || items.length === 0) {
      throw new AppError(
        "Carrinho vazio para cálculo do frete.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Fonte da verdade: mesmo motor do /api/shipping/quote
    const quote = await getQuote({ cep, items });

    // Não confia em frete vindo do frontend; sobrescreve.
    req.body.shipping_price = Number(quote.price || 0);
    req.body.shipping_rule_applied = String(quote.ruleApplied || "ZONE");
    req.body.shipping_prazo_dias =
      quote.prazo_dias === undefined ? null : quote.prazo_dias;
    req.body.shipping_cep = String(quote.cep || cep);

    // cache interno (útil para debug e persistência)
    req.__shippingCalc = {
      shipping_price: req.body.shipping_price,
      shipping_rule_applied: req.body.shipping_rule_applied,
      shipping_prazo_dias: req.body.shipping_prazo_dias,
      shipping_cep: req.body.shipping_cep,
      freeItems: quote.freeItems || [],
      entrega_tipo: "ENTREGA",
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = recalcShipping;
