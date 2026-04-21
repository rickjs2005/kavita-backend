// routes/producer/producerPanel.js
//
// Rotas autenticadas do painel do produtor. verifyProducer aplicado
// via mount no routes/index.js ou producerRoutes.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/producerController");
const { validate } = require("../../middleware/validate");
const {
  updateProducerProfileSchema,
  createAlertSubscriptionSchema,
} = require("../../schemas/producerSchemas");

// Perfil
router.get("/me", ctrl.getMe);
router.post("/logout", ctrl.logout);
router.put(
  "/profile",
  validate(updateProducerProfileSchema),
  ctrl.updateProfile,
);

// Favoritos
router.get("/favorites", ctrl.listFavorites);
router.post("/favorites/:corretoraId", ctrl.addFavorite);
router.delete("/favorites/:corretoraId", ctrl.removeFavorite);

// Histórico
router.get("/leads/history", ctrl.getLeadHistory);

// Alertas (esqueleto)
router.get("/alerts", ctrl.listAlerts);
router.post("/alerts", validate(createAlertSubscriptionSchema), ctrl.createAlert);
router.delete("/alerts/:id", ctrl.deleteAlert);

// Fase 10.1 PR 4 — contratos do produtor.
router.use("/contratos", require("./producerContratos"));

// Fase 10.3 — direitos LGPD (meus dados, exportar, excluir).
router.use("/privacidade", require("./producerPrivacy"));

module.exports = router;
