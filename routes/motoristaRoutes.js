"use strict";
// routes/motoristaRoutes.js
//
// Rotas do motorista de entrega (marketplace). Sub-grupos:
//   /api/public/motorista/*  — sem auth (magic link, consume, logout)
//   /api/motorista/*         — autenticado via cookie motoristaToken
//
// Padrao espelhado de producerRoutes.js.

const router = require("express").Router();
const verifyMotorista = require("../middleware/verifyMotorista");
const { validateCSRF } = require("../middleware/csrfProtection");
const { handleRouteLoadError } = require("./routeLoader");

// Publico — sem CSRF (auth anonima via magic link).
try {
  router.use(
    "/public/motorista",
    require("./motorista/motoristaAuth"),
  );
} catch (err) {
  handleRouteLoadError("./motorista/motoristaAuth", err);
}

// Autenticado — verifyMotorista + validateCSRF.
try {
  router.use(
    "/motorista",
    verifyMotorista,
    validateCSRF,
    require("./motorista/motoristaPanel"),
  );
} catch (err) {
  handleRouteLoadError("./motorista/motoristaPanel", err);
}

module.exports = router;
