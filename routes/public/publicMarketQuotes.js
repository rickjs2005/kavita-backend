// routes/public/publicMarketQuotes.js
//
// Fase 10.4 — ticker de cotação para o painel + ficha pública.
// Sem auth, sem CSRF. Fail-silent: se o DB estiver vazio (cron ainda
// não rodou), devolve 200 com cotações null — UI esconde strip.
"use strict";

const express = require("express");
const router = express.Router();

const { response } = require("../../lib");
const marketQuotesService = require("../../services/marketQuotesService");
const logger = require("../../lib/logger");

router.get("/current", async (_req, res) => {
  try {
    const data = await marketQuotesService.getCurrent();
    return response.ok(res, data);
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "market_quotes.current.endpoint_error",
    );
    return response.ok(res, { cepea_arabica: null, ice_coffee_c: null });
  }
});

module.exports = router;
