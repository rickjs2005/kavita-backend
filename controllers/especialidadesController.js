"use strict";
// controllers/especialidadesController.js
//
// Handlers para especialidades de colaboradores.
// Consumidores:
//   routes/admin/adminEspecialidades.js  (GET /api/admin/especialidades)
//   routes/public/publicEspecialidades.js (GET /api/public/especialidades)

const { response } = require("../lib");
const repo = require("../repositories/especialidadesRepository");

// ---------------------------------------------------------------------------
// GET /api/admin/especialidades
// GET /api/public/especialidades
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/especialidades:
 *   get:
 *     tags: [Admin - Especialidades]
 *     summary: Lista todas as especialidades de colaboradores
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de especialidades
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/public/especialidades:
 *   get:
 *     tags: [Público - Especialidades]
 *     summary: Lista especialidades para o formulário público "Trabalhe Conosco"
 *     responses:
 *       200:
 *         description: Lista de especialidades
 *       500:
 *         description: Erro interno
 */
const listEspecialidades = async (_req, res, next) => {
  try {
    const especialidades = await repo.findAll();
    response.ok(res, especialidades);
  } catch (err) {
    next(err);
  }
};

module.exports = { listEspecialidades };
