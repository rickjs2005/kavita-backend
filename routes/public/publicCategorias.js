"use strict";
// routes/public/publicCategorias.js
//
// Rota magra — só wiring. Toda lógica em controller/repository.
// Migrado de routes/public/_legacy/publicCategorias.js.
//
// Endpoints:
//   GET / → listCategorias

const router = require("express").Router();
const ctrl = require("../../controllers/categoriasPublicController");

/**
 * @openapi
 * /api/public/categorias:
 *   get:
 *     tags: [Public, Categorias]
 *     summary: Lista todas as categorias ativas com contagem de produtos
 *     responses:
 *       200:
 *         description: Lista de categorias retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:             { type: integer }
 *                       name:           { type: string }
 *                       slug:           { type: string }
 *                       is_active:      { type: integer }
 *                       sort_order:     { type: integer }
 *                       total_products: { type: integer }
 *       500:
 *         description: Erro interno no servidor
 */
router.get("/", ctrl.listCategorias);

module.exports = router;
