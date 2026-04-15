// controllers/corretoraPanel/planCorretoraController.js
//
// Endpoint /api/corretora/plan — frontend do painel consulta para
// saber o que pode/não pode mostrar + uso atual vs limite do plano.
"use strict";

const { response } = require("../../lib");
const planService = require("../../services/planService");
const usersRepo = require("../../repositories/corretoraUsersRepository");

async function getMyPlan(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const ctx = await planService.getPlanContext(corretoraId);

    // Uso real vs limites. Hoje o único limite numérico relevante é
    // `max_users`. Adicionar outros aqui conforme novos forem criados.
    const usersTotal = await usersRepo.countByCorretoraId(corretoraId);
    const usage = {
      users: {
        used: usersTotal,
        limit: ctx.capabilities?.max_users ?? null,
      },
    };

    response.ok(res, { ...ctx, usage });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPlan };
