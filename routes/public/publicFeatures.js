// routes/public/publicFeatures.js
//
// FIX #3 — endpoint público leve que expõe capacidades de integração
// ativas no ambiente, pra frontend decidir mostrar/esconder UI cujo
// backend depende de credencial externa.
//
// Hoje cobre: SMS, cotação de café. Fácil de estender quando mais
// features ganharem opt-in condicional.
//
// Sem auth (informação não sensível — é só "está ligado ou não").
"use strict";

const express = require("express");
const router = express.Router();
const { response } = require("../../lib");
const smsService = require("../../services/smsService");
const cotacoesCafe = require("../../services/cotacoesCafeService");

router.get("/", async (_req, res) => {
  // cotacao: sondamos sem bater na fonte — o service decide via
  // COTACAO_CAFE_PROVIDER + adapter.isConfigured(); se ambos ok
  // O getArabicaSpot devolve valor cacheado (barato). Uma chamada
  // vazia aqui basta pra sinalizar "liga ticker".
  let cotacaoActive = false;
  try {
    const spot = await cotacoesCafe.getArabicaSpot();
    cotacaoActive = spot !== null;
  } catch {
    cotacaoActive = false;
  }

  response.ok(res, {
    sms_active: smsService.isActive(),
    cotacao_active: cotacaoActive,
  });
});

module.exports = router;
