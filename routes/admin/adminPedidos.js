// =============================================================================
// ARQUIVO LEGADO — NÃO USE COMO REFERÊNCIA DE IMPLEMENTAÇÃO
// =============================================================================
// Este arquivo usa o padrão antigo: SQL inline na rota, validação manual
// e res.json() direto, sem controller/service/repository separados.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - prefira migrar para o padrão canônico na mesma PR
//   - se a mudança for pontual, adicione ou atualize o teste correspondente
//   - nunca amplie o padrão legado com novas rotas neste arquivo
// =============================================================================

"use strict";

const express = require("express");
const router = express.Router();

const verifyAdmin = require("../../middleware/verifyAdmin");
const orderService = require("../../services/orderService");
const ERROR_CODES = require("../../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Internal error helper
// ---------------------------------------------------------------------------

const handleErroInterno = (res, err, contexto = "erro") => {
  console.error(`Erro ao ${contexto}:`, err);
  res.status(500).json({ ok: false, code: ERROR_CODES.SERVER_ERROR, message: `Erro ao ${contexto}` });
};

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Endpoints administrativos (pedidos, produtos, etc.)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AdminPedidoItem:
 *       type: object
 *       properties:
 *         produto:
 *           type: string
 *           example: "Ração Premium 25kg"
 *         quantidade:
 *           type: integer
 *           example: 2
 *         preco_unitario:
 *           type: number
 *           format: float
 *           example: 99.9
 *
 *     AdminPedidoResumo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 123
 *         usuario_id:
 *           type: integer
 *           example: 19
 *         usuario:
 *           type: string
 *           example: "José da Silva"
 *         email:
 *           type: string
 *           nullable: true
 *           example: "cliente@exemplo.com"
 *         telefone:
 *           type: string
 *           nullable: true
 *           example: "33999998888"
 *         cpf:
 *           type: string
 *           nullable: true
 *           example: "111.111.111-11"
 *         forma_pagamento:
 *           type: string
 *           example: "pix"
 *         status_pagamento:
 *           type: string
 *           enum: [pendente, pago, falhou, estornado]
 *           example: "pago"
 *         status_entrega:
 *           type: string
 *           enum: [em_separacao, processando, enviado, entregue, cancelado]
 *           example: "enviado"
 *         total:
 *           type: number
 *           format: float
 *           example: 199.9
 *         data_pedido:
 *           type: string
 *           format: date-time
 *           example: "2025-11-20T18:30:00Z"
 *         endereco:
 *           type: object
 *           description: Endereço de entrega já parseado a partir do JSON salvo
 *           properties:
 *             cep: { type: string, example: "39800-000" }
 *             rua: { type: string, example: "Rua das Flores" }
 *             numero: { type: string, example: "123" }
 *             bairro: { type: string, example: "Centro" }
 *             cidade: { type: string, example: "Teófilo Otoni" }
 *             estado: { type: string, example: "MG" }
 *       required:
 *         [
 *           id,
 *           usuario_id,
 *           usuario,
 *           forma_pagamento,
 *           status_pagamento,
 *           status_entrega,
 *           total,
 *           data_pedido
 *         ]
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
 *     tags: [Admin, Pedidos]
 *     summary: Lista todos os pedidos com itens, status e endereço
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos do sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdminPedidoResumo'
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar pedidos
 */
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const pedidos = await orderService.listOrders();
    res.json(pedidos);
  } catch (err) {
    handleErroInterno(res, err, "buscar pedidos");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}:
 *   get:
 *     tags: [Admin, Pedidos]
 *     summary: Detalhe de um pedido específico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminPedidoDetalhe'
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao buscar pedido
 */
router.get("/:id", verifyAdmin, async (req, res) => {
  try {
    const pedido = await orderService.getOrderById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ ok: false, code: ERROR_CODES.NOT_FOUND, message: "Pedido não encontrado" });
    }

    res.json(pedido);
  } catch (err) {
    handleErroInterno(res, err, "buscar detalhamento de pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/pagamento:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de pagamento de um pedido (dispara comunicação automática quando marcado como pago)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status_pagamento:
 *                 type: string
 *                 enum: [pendente, pago, falhou, estornado]
 *     responses:
 *       200:
 *         description: Status de pagamento atualizado
 *       400:
 *         description: Status inválido
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao atualizar status de pagamento
 */
router.put("/:id/pagamento", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status_pagamento } = req.body;

  if (!orderService.ALLOWED_PAYMENT_STATUSES.includes(status_pagamento)) {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "status_pagamento inválido", status_pagamento });
  }

  try {
    const result = await orderService.updatePaymentStatus(id, status_pagamento);

    if (!result.found) {
      return res.status(404).json({ ok: false, code: ERROR_CODES.NOT_FOUND, message: "Pedido não encontrado" });
    }

    res.json({ message: "Status de pagamento atualizado com sucesso" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de pagamento");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/entrega:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de entrega de um pedido (dispara comunicação automática quando marcado como enviado)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status_entrega:
 *                 type: string
 *                 enum: [em_separacao, processando, enviado, entregue, cancelado]
 *     responses:
 *       200:
 *         description: Status de entrega atualizado
 *       400:
 *         description: Status inválido
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao atualizar status de entrega
 */
router.put("/:id/entrega", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status_entrega } = req.body;

  if (!orderService.ALLOWED_DELIVERY_STATUSES.includes(status_entrega)) {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "status_entrega inválido", status_entrega });
  }

  try {
    const result = await orderService.updateDeliveryStatus(id, status_entrega);

    if (!result.found) {
      return res.status(404).json({ ok: false, code: ERROR_CODES.NOT_FOUND, message: "Pedido não encontrado" });
    }

    res.json({ message: "Status de entrega atualizado com sucesso" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de entrega");
  }
});

module.exports = router;
