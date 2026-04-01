"use strict";
// controllers/servicosAdminController.js
//
// Extrai dados de req, delega ao service, responde com lib/response.js.
// Consumidor: routes/admin/adminServicos.js

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");
const service = require("../services/servicosAdminService");

// ---------------------------------------------------------------------------
// GET /api/admin/servicos
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/servicos:
 *   get:
 *     tags: [Admin - Serviços]
 *     summary: Lista todos os colaboradores/serviços cadastrados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de serviços
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
const listServicos = async (_req, res, next) => {
  try {
    const servicos = await service.listServicos();
    response.ok(res, servicos);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/servicos
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/servicos:
 *   post:
 *     tags: [Admin - Serviços]
 *     summary: Cria um novo serviço/colaborador
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nome, whatsapp, especialidade_id]
 *             properties:
 *               nome: { type: string }
 *               cargo: { type: string }
 *               whatsapp: { type: string }
 *               descricao: { type: string }
 *               especialidade_id: { type: integer }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Serviço criado
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
const createServico = async (req, res, next) => {
  try {
    const result = await service.createServico(req.body, req.files || []);
    response.created(res, result);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/servicos/:id
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/servicos/{id}:
 *   put:
 *     tags: [Admin - Serviços]
 *     summary: Atualiza um serviço/colaborador e suas imagens
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nome, whatsapp, especialidade_id]
 *             properties:
 *               nome: { type: string }
 *               cargo: { type: string }
 *               whatsapp: { type: string }
 *               descricao: { type: string }
 *               especialidade_id: { type: integer }
 *               keepImages:
 *                 type: string
 *                 description: Array JSON com paths das imagens a manter
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Serviço atualizado
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro interno
 */
const updateServico = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { keepImages = [], ...fields } = req.body;
    await service.updateServico(Number(id), fields, keepImages, req.files || []);
    response.ok(res, null, "Serviço atualizado com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/servicos/:id
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/servicos/{id}:
 *   delete:
 *     tags: [Admin - Serviços]
 *     summary: Remove um serviço/colaborador
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Serviço removido
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro interno
 */
const deleteServico = async (req, res, next) => {
  try {
    await service.deleteServico(Number(req.params.id));
    response.ok(res, null, "Serviço removido com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/admin/servicos/:id/verificado
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/servicos/{id}/verificado:
 *   patch:
 *     tags: [Admin - Serviços]
 *     summary: Atualiza status de verificação do serviço/colaborador
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
 *             required: [verificado]
 *             properties:
 *               verificado: { type: boolean }
 *     responses:
 *       200:
 *         description: Status de verificação atualizado
 *       400:
 *         description: Requisição inválida
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro interno
 */
const setVerificado = async (req, res, next) => {
  try {
    const { verificado } = req.body;
    await service.setVerificado(Number(req.params.id), verificado);
    response.ok(res, { verificado }, `Serviço ${verificado ? "verificado" : "marcado como não verificado"} com sucesso.`);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listServicos,
  createServico,
  updateServico,
  deleteServico,
  setVerificado,
};
