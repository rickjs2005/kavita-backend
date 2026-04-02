"use strict";
// routes/admin/adminShippingZones.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF são aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const {
  createZoneSchema,
  updateZoneSchema,
  idParamSchema,
} = require("../../schemas/shippingZonesSchemas");
const ctrl = require("../../controllers/shippingZonesController");

/**
 * @openapi
 * tags:
 *   - name: Admin Shipping
 *     description: Regras de frete por regiões (UF + cidades)
 */

// GET  /api/admin/shipping/zones
router.get("/zones", ctrl.listZones);

// POST /api/admin/shipping/zones
router.post(
  "/zones",
  validate(createZoneSchema, "body"),
  ctrl.createZone
);

// PUT  /api/admin/shipping/zones/:id
router.put(
  "/zones/:id",
  validate(idParamSchema, "params"),
  validate(updateZoneSchema, "body"),
  ctrl.updateZone
);

// DELETE /api/admin/shipping/zones/:id
router.delete(
  "/zones/:id",
  validate(idParamSchema, "params"),
  ctrl.deleteZone
);

module.exports = router;
