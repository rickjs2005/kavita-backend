// routes/public/webhookClicksign.js
//
// Webhook ClickSign (Fase 10.1 — PR 2). Sem auth, sem CSRF — a
// segurança é a assinatura HMAC validada pelo controller.
//
// express.raw() é MANDATÓRIO aqui. O HMAC é calculado sobre os
// bytes exatos do body — se express.json() normalizar (reordenar
// chaves, trimar espaços) a assinatura quebra.
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/public/webhookClicksignController");
const { webhookLimiter } = require("../../middleware/absoluteRateLimit");

// Aceita qualquer content-type como Buffer bruto. Limite de 1MB
// cobre webhooks de eventos normais da ClickSign (payload < 50KB).
//
// NOTA Fase 1 go-live: o body já chega parseado por express.json
// global (server.js) com req.rawBody preservado. O express.raw aqui
// é mantido como fallback defensivo para content-types não-JSON; o
// controller prefere req.rawBody quando disponível.
router.post(
  "/",
  webhookLimiter,
  express.raw({ type: "*/*", limit: "1mb" }),
  ctrl.ingest,
);

module.exports = router;
