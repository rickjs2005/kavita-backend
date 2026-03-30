"use strict";
// routes/public/publicPromocoes.js
//
// Rota magra — só wiring. Toda lógica em controller/service/repository.
// Migrado de routes/public/_legacy/publicPromocoes.js.
//
// Endpoints:
//   GET /             → listPromocoes  (todas as promoções ativas)
//   GET /:productId   → getPromocao   (promoção ativa de um produto)

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/promocoesPublicController");
const { ProductIdParamSchema } = require("../../schemas/promocoesSchemas");

router.get("/", ctrl.listPromocoes);
router.get("/:productId", validate(ProductIdParamSchema, "params"), ctrl.getPromocao);

module.exports = router;
