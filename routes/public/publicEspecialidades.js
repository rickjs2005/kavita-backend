"use strict";
// routes/public/publicEspecialidades.js
//
// Endpoint público para listagem de especialidades.
// Usado pelo formulário "Trabalhe Conosco" para popular o dropdown de especialidade.
//
// Migrado de: GET /api/admin/especialidades/public (sem auth, path incorreto)
//        para: GET /api/public/especialidades      (path correto no publicRoutes)

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/especialidadesController");

// GET /api/public/especialidades
router.get("/", ctrl.listEspecialidades);

module.exports = router;
