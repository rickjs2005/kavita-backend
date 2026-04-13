// routes/admin/adminPedidos.js
//
// Rota magra: wiring de handlers para /api/admin/pedidos.
// verifyAdmin + validateCSRF + requirePermission("pedidos.ver") aplicados
// no mount em routes/index.js — não repetir aqui.
//
// Handlers: controllers/adminOrdersController.js
// Service:  services/orderService.js
// Schemas:  schemas/ordersSchemas.js

"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../controllers/adminOrdersController");
const { validate } = require("../../middleware/validate");
const {
  updatePaymentStatusSchema,
  updateDeliveryStatusSchema,
  updateOrderAddressSchema,
} = require("../../schemas/ordersSchemas");
const { updateOcorrenciaSchema } = require("../../schemas/pedidoOcorrenciasSchemas");

/**
 * @openapi
 * tags:
 *   - name: Admin Pedidos
 *     description: Gestão de pedidos no painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AdminPedidoItem:
 *       type: object
 *       properties:
 *         produto:       { type: string,  example: "Ração Premium 25kg" }
 *         quantidade:    { type: integer, example: 2 }
 *         preco_unitario: { type: number, format: float, example: 99.9 }
 *
 *     AdminPedidoResumo:
 *       type: object
 *       required: [id, usuario_id, usuario, forma_pagamento, status_pagamento, status_entrega, total, data_pedido]
 *       properties:
 *         id:               { type: integer, example: 123 }
 *         usuario_id:       { type: integer, example: 19 }
 *         usuario:          { type: string,  example: "José da Silva" }
 *         email:            { type: string,  nullable: true, example: "cliente@exemplo.com" }
 *         telefone:         { type: string,  nullable: true, example: "33999998888" }
 *         cpf:              { type: string,  nullable: true, example: "111.111.111-11" }
 *         forma_pagamento:  { type: string,  example: "pix" }
 *         status_pagamento: { type: string,  enum: [pendente, pago, falhou, estornado], example: "pago" }
 *         status_entrega:   { type: string,  enum: [em_separacao, processando, enviado, entregue, cancelado], example: "enviado" }
 *         total:            { type: number,  format: float, example: 199.9 }
 *         data_pedido:      { type: string,  format: date-time, example: "2025-11-20T18:30:00Z" }
 *         endereco:
 *           type: object
 *           properties:
 *             cep:    { type: string, example: "39800-000" }
 *             rua:    { type: string, example: "Rua das Flores" }
 *             numero: { type: string, example: "123" }
 *             bairro: { type: string, example: "Centro" }
 *             cidade: { type: string, example: "Teófilo Otoni" }
 *             estado: { type: string, example: "MG" }
 *
 *     AdminPedidoDetalhe:
 *       allOf:
 *         - $ref: '#/components/schemas/AdminPedidoResumo'
 *         - type: object
 *           properties:
 *             itens:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdminPedidoItem'
 */

/**
 * @openapi
 * /api/admin/pedidos:
 *   get:
 *     tags: [Admin Pedidos]
 *     summary: Lista todos os pedidos com itens, status e endereço
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos do sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:   { type: boolean, example: true }
 *                 data: { type: array, items: { $ref: '#/components/schemas/AdminPedidoResumo' } }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.get("/", controller.listOrders);

// --- Ocorrências (antes de /:id para evitar conflito de rota) ---
router.get("/ocorrencias", controller.listOcorrencias);
router.put("/ocorrencias/:ocorrenciaId", validate(updateOcorrenciaSchema), controller.updateOcorrencia);

/**
 * @openapi
 * /api/admin/pedidos/{id}:
 *   get:
 *     tags: [Admin Pedidos]
 *     summary: Detalhe de um pedido específico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:   { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/AdminPedidoDetalhe' }
 *       401: { description: Não autorizado }
 *       404: { description: Pedido não encontrado }
 *       500: { description: Erro interno }
 */
router.get("/:id", controller.getOrderById);

/**
 * @openapi
 * /api/admin/pedidos/{id}/pagamento:
 *   put:
 *     tags: [Admin Pedidos]
 *     summary: Atualiza status de pagamento (dispara comunicação quando marcado como pago)
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
 *             required: [status_pagamento]
 *             properties:
 *               status_pagamento: { type: string, enum: [pendente, pago, falhou, estornado] }
 *     responses:
 *       200: { description: Status de pagamento atualizado }
 *       400: { description: status_pagamento inválido }
 *       404: { description: Pedido não encontrado }
 *       500: { description: Erro interno }
 */
router.put("/:id/pagamento", validate(updatePaymentStatusSchema), controller.updatePaymentStatus);

/**
 * @openapi
 * /api/admin/pedidos/{id}/entrega:
 *   put:
 *     tags: [Admin Pedidos]
 *     summary: Atualiza status de entrega (dispara comunicação quando marcado como enviado)
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
 *             required: [status_entrega]
 *             properties:
 *               status_entrega: { type: string, enum: [em_separacao, processando, enviado, entregue, cancelado] }
 *     responses:
 *       200: { description: Status de entrega atualizado }
 *       400: { description: status_entrega inválido }
 *       404: { description: Pedido não encontrado }
 *       500: { description: Erro interno }
 */
router.put("/:id/entrega", validate(updateDeliveryStatusSchema), controller.updateDeliveryStatus);
router.put("/:id/endereco", validate(updateOrderAddressSchema), controller.updateOrderAddress);

module.exports = router;
