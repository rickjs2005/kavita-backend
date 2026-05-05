"use strict";
// routes/corretoraPanel/corretoraWhatsapp.js — Etapa 5 da reativacao.
//
// Endpoints do painel WhatsApp da corretora.
// Auth/CSRF aplicados pelo router pai (corretoraPanelRoutes).

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/corretoraPanel/whatsappCorretoraController");
const {
  listMessagesQuery,
  listInboundQuery,
  sendMessageBody,
} = require("../../schemas/whatsappCorretoraSchemas");

router.get("/messages", validate(listMessagesQuery, "query"), ctrl.listMessages);
router.get("/inbound", validate(listInboundQuery, "query"), ctrl.listInbound);
router.post("/send", validate(sendMessageBody, "body"), ctrl.sendMessage);

module.exports = router;
