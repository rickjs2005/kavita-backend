"use strict";
// routes/public/publicServicos.js
//
// Rota magra — só wiring. Toda lógica em controller/service/repository.
// Migrado de routes/public/_legacy/publicServicos.js.
//
// Endpoints:
//   GET  /                      → listServicos
//   POST /solicitacoes          → createSolicitacao
//   POST /avaliacoes            → createAvaliacao
//   POST /trabalhe-conosco      → createTrabalheConosco
//   GET  /:id                   → getServico
//   GET  /:id/avaliacoes        → listAvaliacoes
//   POST /:id/view              → registerView
//   POST /:id/whatsapp          → registerWhatsappClick
//
// ⚠️  Rotas estáticas devem vir ANTES de /:id para evitar shadowing.

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/servicosPublicController");
const {
  ServicosQuerySchema,
  ServicoIdParamSchema,
  SolicitacaoBodySchema,
  AvaliacaoBodySchema,
  TrabalheConoscoBodySchema,
} = require("../../schemas/servicosSchemas");

// — Rotas estáticas (devem vir antes de /:id) —
router.get("/", validate(ServicosQuerySchema, "query"), ctrl.listServicos);
router.post("/solicitacoes", validate(SolicitacaoBodySchema), ctrl.createSolicitacao);
router.post("/avaliacoes", validate(AvaliacaoBodySchema), ctrl.createAvaliacao);
router.post("/trabalhe-conosco", validate(TrabalheConoscoBodySchema), ctrl.createTrabalheConosco);

// — Rotas dinâmicas —
router.get("/:id", validate(ServicoIdParamSchema, "params"), ctrl.getServico);
router.get("/:id/avaliacoes", validate(ServicoIdParamSchema, "params"), ctrl.listAvaliacoes);
router.post("/:id/view", validate(ServicoIdParamSchema, "params"), ctrl.registerView);
router.post("/:id/whatsapp", validate(ServicoIdParamSchema, "params"), ctrl.registerWhatsappClick);

module.exports = router;
