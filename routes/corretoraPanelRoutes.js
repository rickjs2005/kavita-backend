"use strict";
// routes/corretoraPanelRoutes.js
//
// Rotas do painel autenticado da corretora (Mercado do Café Fase 2).
// Todas protegidas por verifyCorretora + validateCSRF.
//
// Login/logout/me ficam em routes/auth/corretoraAuth.js (montado em
// authIndex.js), seguindo a mesma separação de admin vs adminRoutes.

const router = require("express").Router();
const verifyCorretora = require("../middleware/verifyCorretora");
const { validateCSRF } = require("../middleware/csrfProtection");
const { handleRouteLoadError } = require("./routeLoader");

function mount(path, moduleName) {
  try {
    const mod = require(moduleName);
    router.use(path, verifyCorretora, validateCSRF, mod);
  } catch (err) {
    handleRouteLoadError(moduleName, err);
  }
}

mount("/corretora/profile", "./corretoraPanel/corretoraProfile");
mount("/corretora/leads", "./corretoraPanel/corretoraLeads");
mount("/corretora/team", "./corretoraPanel/corretoraTeam");
mount("/corretora/notifications", "./corretoraPanel/corretoraNotifications");
mount("/corretora/plan", "./corretoraPanel/corretoraPlan");
mount("/corretora/reviews", "./corretoraPanel/corretoraReviews");
mount("/corretora/analytics", "./corretoraPanel/corretoraAnalytics");
// ETAPA 2 — 2FA TOTP + logout-all
mount("/corretora/2fa", "./corretoraPanel/corretoraTotp");
// Encerramento de conta (self-service owner).
mount("/corretora/account", "./corretoraPanel/corretoraAccount");

module.exports = router;
