// controllers/corretoraPanel/planCorretoraController.js
//
// Endpoint /api/corretora/plan — frontend do painel consulta para
// saber o que pode/não pode mostrar.
"use strict";

const { response } = require("../../lib");
const planService = require("../../services/planService");

async function getMyPlan(req, res, next) {
  try {
    const ctx = await planService.getPlanContext(req.corretoraUser.corretora_id);
    response.ok(res, ctx);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPlan };
