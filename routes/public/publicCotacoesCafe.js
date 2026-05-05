// routes/public/publicCotacoesCafe.js
//
// Endpoint público de cotação do café arábica.
// Estratégia em camadas:
//   1) tenta cotação ao vivo via cotacoesCafeService.getArabicaSpot()
//   2) se indisponível, busca o último snapshot salvo em
//      news_cotacoes_history (slug=cafe-arabica) e devolve com stale=true
//   3) se nem isso, responde 200 + null (frontend já trata)
//
// Sem auth (só leitura). Falha de provider é logada (warn) e não derruba
// a página.
"use strict";

const express = require("express");
const router = express.Router();
const { response } = require("../../lib");
const cotacoesCafe = require("../../services/cotacoesCafeService");
const cotacoesRepository = require("../../repositories/cotacoesRepository");
const logger = require("../../lib/logger");

const ARABICA_SLUG = "cafe-arabica";

async function readHistoryFallback() {
  const cotacao = await cotacoesRepository.getCotacaoPublicBySlug(ARABICA_SLUG);
  if (!cotacao) return null;

  const history = await cotacoesRepository.listCotacaoHistoryPublic(
    cotacao.id,
    1,
  );
  if (!Array.isArray(history) || history.length === 0) return null;

  const last = history[0];
  const priceNum = Number(last.price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) return null;

  const variation =
    last.variation_day != null && Number.isFinite(Number(last.variation_day))
      ? Number(Number(last.variation_day).toFixed(2))
      : null;

  return {
    price_cents: Math.round(priceNum * 100),
    variation_pct: variation,
    as_of: last.observed_at
      ? String(last.observed_at).slice(0, 10)
      : last.created_at
        ? String(last.created_at).slice(0, 10)
        : null,
    source: last.source || "historico",
    source_url: null,
    stale: true,
  };
}

router.get("/arabica", async (_req, res) => {
  try {
    const spot = await cotacoesCafe.getArabicaSpot();
    if (spot) {
      return response.ok(res, { ...spot, stale: false });
    }

    logger.info("cotacoes.cafe.spot_unavailable_trying_history");
    const fallback = await readHistoryFallback();
    if (fallback) {
      logger.info(
        { as_of: fallback.as_of, source: fallback.source },
        "cotacoes.cafe.using_history_fallback",
      );
      return response.ok(res, fallback);
    }

    logger.warn("cotacoes.cafe.no_data_available");
    return response.ok(res, null);
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "cotacoes.cafe.endpoint_error",
    );
    return response.ok(res, null);
  }
});

module.exports = router;
