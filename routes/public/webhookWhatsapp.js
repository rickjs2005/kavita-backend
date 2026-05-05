"use strict";
// routes/public/webhookWhatsapp.js — Etapa 4 da reativacao.
//
// Webhook Meta Cloud (WhatsApp Business). Sem auth, sem CSRF — a
// seguranca e' a assinatura HMAC validada no controller.
//
// express.raw() e' MANDATORIO no POST. O HMAC e' calculado sobre os
// bytes exatos do body. Se express.json() normalizar (reordenar
// chaves, trimar) a assinatura quebra.

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/public/webhookWhatsappController");
const { webhookLimiter } = require("../../middleware/absoluteRateLimit");

// GET de verificacao da subscricao (Meta chama uma vez ao plugar).
// Sem rate limit — Meta executa apenas no setup; bloqueio aqui
// quebra o onboarding sem ganho de seguranca (nao cria estado).
router.get("/", ctrl.verify);

// POST de eventos — status updates + inbound. Aplica:
//   - rate limit absoluto pra absorver eventual surto Meta
//   - express.raw fallback caso content-type nao seja JSON
//     (express.json com {verify} ja preserva req.rawBody no caso
//     padrao — ver server.js)
router.post(
  "/",
  webhookLimiter,
  express.raw({ type: "*/*", limit: "1mb" }),
  ctrl.ingest,
);

module.exports = router;
