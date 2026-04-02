"use strict";
// controllers/shippingController.js
//
// Handler de cotação de frete.
// Formato A: { ok: true, data } / erros via next(AppError).
//
// Consumer: routes/ecommerce/shipping.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { getQuote } = require("../services/shippingQuoteService");

// ---------------------------------------------------------------------------
// Input parsers
// ---------------------------------------------------------------------------

function parseCep(raw) {
  const cepDigits = String(raw || "").replace(/\D/g, "");
  if (cepDigits.length !== 8) {
    throw new AppError("CEP inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return cepDigits;
}

function parseItems(raw) {
  let items = raw;

  if (typeof raw === "string") {
    try {
      items = JSON.parse(raw);
    } catch {
      throw new AppError("Parâmetro 'items' inválido (JSON).", ERROR_CODES.VALIDATION_ERROR, 400);
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Carrinho vazio ou 'items' inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const normalized = items
    .map((it) => ({
      id: Number(it?.id),
      quantidade: Number(it?.quantidade),
    }))
    .filter((it) => Number.isFinite(it.id) && it.id > 0);

  if (!normalized.length) {
    throw new AppError("Itens inválidos: IDs ausentes/invalidos.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  for (const it of normalized) {
    if (!Number.isFinite(it.quantidade) || it.quantidade < 1) {
      throw new AppError(
        "Itens inválidos: 'quantidade' deve ser >= 1.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const getShippingQuote = async (req, res, next) => {
  try {
    const cep = parseCep(req.query.cep);
    const items = parseItems(req.query.items);

    const quote = await getQuote({ cep, items });

    response.ok(res, quote);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao cotar frete.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { getShippingQuote };
