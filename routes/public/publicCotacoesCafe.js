// routes/public/publicCotacoesCafe.js
//
// ETAPA 3.1 — endpoint público de cotação do café arábica.
// Sem auth (só leitura). Fail-silent: se provider não está
// configurado ou falhou, retorna 200 com data=null (ficha esconde
// ticker). Evita 500 quebrar a página inteira.
"use strict";

const express = require("express");
const router = express.Router();
const { response } = require("../../lib");
const cotacoesCafe = require("../../services/cotacoesCafeService");
const logger = require("../../lib/logger");

router.get("/arabica", async (_req, res) => {
  try {
    const spot = await cotacoesCafe.getArabicaSpot();
    return response.ok(res, spot);
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err) },
      "cotacoes.cafe.endpoint_error",
    );
    // Erro total: ainda responde 200 + null pra ficha não quebrar
    return response.ok(res, null);
  }
});

module.exports = router;
