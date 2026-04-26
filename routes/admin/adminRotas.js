"use strict";
// routes/admin/adminRotas.js
//
// Rotas de entrega — CRUD + paradas. Mountado em /api/admin/rotas via
// adminRoutes.js — verifyAdmin + validateCSRF + requirePermission ja
// aplicados no nivel do mount.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/admin/rotasAdminController");
const {
  createRotaSchema,
  updateRotaSchema,
  updateRotaStatusSchema,
  adicionarParadaSchema,
  reordenarParadasSchema,
} = require("../../schemas/rotasSchemas");

// Listar pedidos disponiveis pra rota — vem ANTES de /:id pra nao
// conflitar com rota.id="disponiveis" (Number(...) -> NaN bate em _parseId,
// mas e' melhor evitar o trafego na rota errada).
router.get("/disponiveis", ctrl.listarPedidosDisponiveis);
// Fase 4 — alerta de rota parada (em_rota sem update ha > 6h)
router.get("/stale", ctrl.listarStale);

router.get("/", ctrl.listar);
router.post("/", validate(createRotaSchema), ctrl.criar);
router.get("/:id", ctrl.detalhe);
router.put("/:id", validate(updateRotaSchema), ctrl.atualizar);
router.delete("/:id", ctrl.deletar);

router.patch(
  "/:id/status",
  validate(updateRotaStatusSchema),
  ctrl.alterarStatus,
);

router.post(
  "/:id/paradas",
  validate(adicionarParadaSchema),
  ctrl.adicionarParada,
);
router.delete("/:id/paradas/:pedidoId", ctrl.removerParada);
router.put(
  "/:id/paradas/ordem",
  validate(reordenarParadasSchema),
  ctrl.reordenarParadas,
);

module.exports = router;
