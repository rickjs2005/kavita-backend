"use strict";
// controllers/shippingZonesController.js
//
// Extrai dados de req, delega ao service, responde com lib/response.js.
// Consumidor: routes/admin/adminShippingZones.js

const { response } = require("../lib");
const service = require("../services/shippingZonesService");

// ---------------------------------------------------------------------------
// GET /api/admin/shipping/zones
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/shipping/zones:
 *   get:
 *     tags: [Admin Shipping]
 *     summary: Lista todas as zonas de frete com cidades
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de zonas
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
const listZones = async (_req, res, next) => {
  try {
    const zones = await service.listZones();
    response.ok(res, zones);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/shipping/zones
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/shipping/zones:
 *   post:
 *     tags: [Admin Shipping]
 *     summary: Cria nova zona de frete
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, state]
 *             properties:
 *               name: { type: string }
 *               state: { type: string, description: "UF com 2 letras" }
 *               all_cities: { type: boolean }
 *               is_free: { type: boolean }
 *               price: { type: number }
 *               prazo_dias: { type: integer, nullable: true }
 *               is_active: { type: boolean }
 *               cities:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201:
 *         description: Zona criada
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
const createZone = async (req, res, next) => {
  try {
    const result = await service.createZone(req.body);
    response.created(res, result);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/shipping/zones/:id
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/shipping/zones/{id}:
 *   put:
 *     tags: [Admin Shipping]
 *     summary: Atualiza zona de frete
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, state]
 *             properties:
 *               name: { type: string }
 *               state: { type: string }
 *               all_cities: { type: boolean }
 *               is_free: { type: boolean }
 *               price: { type: number }
 *               prazo_dias: { type: integer, nullable: true }
 *               is_active: { type: boolean }
 *               cities:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Zona atualizada
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Zona não encontrada
 *       500:
 *         description: Erro interno
 */
const updateZone = async (req, res, next) => {
  try {
    await service.updateZone(Number(req.params.id), req.body);
    response.ok(res, null, "Zona de frete atualizada com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/shipping/zones/:id
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/shipping/zones/{id}:
 *   delete:
 *     tags: [Admin Shipping]
 *     summary: Remove zona de frete
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Zona removida
 *       400:
 *         description: ID inválido
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
const deleteZone = async (req, res, next) => {
  try {
    await service.deleteZone(Number(req.params.id));
    response.noContent(res);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listZones,
  createZone,
  updateZone,
  deleteZone,
};
