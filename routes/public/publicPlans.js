// routes/public/publicPlans.js
//
// Endpoint público de planos para alimentar a página /pricing.
"use strict";

const express = require("express");
const router = express.Router();
const { response } = require("../../lib");
const plansRepo = require("../../repositories/plansRepository");

router.get("/", async (_req, res, next) => {
  try {
    const plans = await plansRepo.listPublic();
    response.ok(res, plans);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
