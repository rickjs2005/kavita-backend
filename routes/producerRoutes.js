"use strict";
// routes/producerRoutes.js
//
// Rotas do produtor. Sub-grupos:
//   /api/public/produtor/*   — sem auth (magic link)
//   /api/produtor/*          — autenticado via cookie producerToken
//
// Padrão espelhado de corretoraPanelRoutes.js / adminRoutes.js.

const router = require("express").Router();
const verifyProducer = require("../middleware/verifyProducer");
const { validateCSRF } = require("../middleware/csrfProtection");
const { handleRouteLoadError } = require("./routeLoader");

// Público — sem CSRF (endpoints de auth anônimos).
try {
  router.use(
    "/public/produtor",
    require("./producer/producerAuth"),
  );
} catch (err) {
  handleRouteLoadError("./producer/producerAuth", err);
}

// Autenticado — verifyProducer + validateCSRF.
try {
  router.use(
    "/produtor",
    verifyProducer,
    validateCSRF,
    require("./producer/producerPanel"),
  );
} catch (err) {
  handleRouteLoadError("./producer/producerPanel", err);
}

module.exports = router;
