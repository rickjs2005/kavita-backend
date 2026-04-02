"use strict";
// controllers/shippingController.js
// =============================================================================
// ⚠️  CONTRATO CONGELADO — NÃO USE COMO REFERÊNCIA PARA CÓDIGO NOVO
// =============================================================================
// Este controller retorna { success: true, ...quote } — divergente do padrão
// oficial { ok: true, data }. O frontend de checkout depende deste shape.
//
// Ao tocar este arquivo:
//   - PRESERVE o formato de resposta exato
//   - NÃO copie este padrão em código novo
//   - Para migrar: coordenar com frontend checkout (ver CLAUDE.md § Contratos)
//
// Shape congelado:
//   GET /api/shipping/quote → { success: true, cep, price, prazo_dias, ... }
//   Erros: via next(new AppError(...)) → padrão A (ok: false) ✅
// =============================================================================

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { getQuote } = require("../services/shippingQuoteService");

// ---------------------------------------------------------------------------
// Input parsers (privados — usados apenas por getShippingQuote)
// ---------------------------------------------------------------------------

function parseCep(raw) {
  const cepDigits = String(raw || "").replace(/\D/g, "");
  if (cepDigits.length !== 8) {
    throw new AppError("CEP inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return cepDigits;
}

function parseItems(raw) {
  // items vem como JSON stringificado (urlencoded) no querystring
  let items = raw;

  if (typeof raw === "string") {
    try {
      items = JSON.parse(raw);
    } catch (e) {
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

    return res.status(200).json({
      success: true,
      ...quote,
    });
  } catch (err) {
    console.error("[shippingController] erro em /api/shipping/quote:", err);
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao cotar frete.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { getShippingQuote };
