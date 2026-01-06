// routes/shippingRoutes.js
const express = require("express");
const router = express.Router();

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { getQuote } = require("../services/shippingQuoteService");

/* ------------------------------------------------------------------ */
/*                               Helpers                              */
/* ------------------------------------------------------------------ */

function parseCep(raw) {
  const cepDigits = String(raw || "").replace(/\D/g, "");
  if (cepDigits.length !== 8) {
    throw new AppError("CEP inválido.", ERROR_CODES.INVALID_INPUT, 400);
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
      throw new AppError("Parâmetro 'items' inválido (JSON).", ERROR_CODES.INVALID_INPUT, 400);
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Carrinho vazio ou 'items' inválido.", ERROR_CODES.INVALID_INPUT, 400);
  }

  const normalized = items
    .map((it) => ({
      id: Number(it?.id),
      quantidade: Number(it?.quantidade),
    }))
    .filter((it) => Number.isFinite(it.id) && it.id > 0);

  if (!normalized.length) {
    throw new AppError("Itens inválidos: IDs ausentes/invalidos.", ERROR_CODES.INVALID_INPUT, 400);
  }

  // quantidade deve ser >= 1 para cotação
  for (const it of normalized) {
    if (!Number.isFinite(it.quantidade) || it.quantidade < 1) {
      throw new AppError(
        "Itens inválidos: 'quantidade' deve ser >= 1.",
        ERROR_CODES.INVALID_INPUT,
        400
      );
    }
  }

  return normalized;
}

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */
/**
 * @openapi
 * tags:
 *   - name: Shipping
 *     description: Cálculo de frete por CEP (frete grátis por produto + zonas + fallback)
 */

/**
 * @openapi
 * /api/shipping/quote:
 *   get:
 *     summary: Cota frete por CEP
 *     description: |
 *       Retorna preço e prazo (dias) conforme regras de frete.
 *
 *       Prioridade de aplicação (ordem correta):
 *       1) Regra do produto (frete grátis por produto / a partir de X unidades)
 *       2) Zona (shipping_zones + shipping_zone_cities por UF + cidade via ViaCEP)
 *       3) Faixa de CEP (fallback em shipping_rates)
 *
 *       Regra 1 — Frete grátis por produto (PRODUCT_FREE):
 *       - Busca no banco os produtos presentes em `items` (por id).
 *       - Lê `products.shipping_free` e `products.shipping_free_from_qty`.
 *       - Se QUALQUER item qualificar a regra do próprio produto:
 *         - shipping_free = 1 e
 *           - shipping_free_from_qty IS NULL (qualquer quantidade) OU
 *           - quantidade >= shipping_free_from_qty
 *         então o preço final retorna `price = 0` e `ruleApplied = "PRODUCT_FREE"`.
 *
 *       Observação: a API pode manter `prazo_dias`/`zone` calculados pela base (zona/faixa),
 *       mesmo quando `price = 0`, para não perder o SLA de entrega no frontend.
 *
 *       Parâmetros:
 *       - `cep` deve conter 8 dígitos (com ou sem máscara).
 *       - `items` é um JSON stringificado (urlencoded) com itens do carrinho.
 *         Exemplo: items=[{"id":1,"quantidade":2}]
 *
 *       Regras de validação:
 *       - carrinho vazio => 400
 *       - CEP inválido => 400
 *       - itens inválidos / produto inexistente => 400
 *       - sem cobertura => 404 (quando não houver zona nem faixa de CEP aplicável)
 *
 *       Campos relevantes de resposta:
 *       - `price`: número (0 quando frete grátis)
 *       - `prazo_dias`: número | null
 *       - `is_free`: boolean
 *       - `ruleApplied`: "PRODUCT_FREE" | "ZONE" | "CEP_RANGE"
 *       - `freeItems`: itens que qualificaram (quando ruleApplied=PRODUCT_FREE)
 *       - `zone`: detalhes da zona aplicada (quando houver)
 *     tags:
 *       - Shipping
 *     parameters:
 *       - in: query
 *         name: cep
 *         required: true
 *         schema:
 *           type: string
 *         example: "36940-000"
 *       - in: query
 *         name: items
 *         required: true
 *         schema:
 *           type: string
 *         example: '[{"id":1,"quantidade":2}]'
 *     responses:
 *       200:
 *         description: Cotação de frete
 *       400:
 *         description: CEP inválido, carrinho vazio, itens inválidos ou produto inexistente
 *       404:
 *         description: CEP sem cobertura
 *       500:
 *         description: Erro interno
 */

/* ------------------------------------------------------------------ */
/*                               Route                                */
/* ------------------------------------------------------------------ */

router.get("/quote", async (req, res, next) => {
  try {
    const cep = parseCep(req.query.cep);
    const items = parseItems(req.query.items);

    // ✅ Sem duplicar regra aqui: service centraliza PRIORIDADES (PRODUCT_FREE > ZONE > CEP_RANGE)
    const quote = await getQuote({ cep, items });

    return res.status(200).json({
      success: true,
      ...quote,
    });
  } catch (err) {
    console.error("[shippingRoutes] erro em /api/shipping/quote:", err);
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao cotar frete.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

module.exports = router;
