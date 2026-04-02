// routes/ecommerce/shipping.js
// ✅ Padrão moderno — rota magra.
const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/shippingController");

router.get("/quote", ctrl.getShippingQuote);

module.exports = router;
