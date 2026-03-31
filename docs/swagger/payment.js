/**
 * @openapi
 * tags:
 *   - name: Pagamentos
 *     description: Integração Mercado Pago + métodos de pagamento
 *
 * components:
 *   schemas:
 *     ApiError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: "pedidoId é obrigatório."
 *     PaymentMethod:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         code: { type: string, example: "pix" }
 *         label: { type: string, example: "Pix" }
 *         description: { type: string, nullable: true, example: "Pagamento instantâneo via Pix." }
 *         is_active: { type: integer, example: 1 }
 *         sort_order: { type: integer, example: 10 }
 *         created_at: { type: string, example: "2026-01-09 10:00:00" }
 *         updated_at: { type: string, nullable: true, example: "2026-01-09 10:05:00" }
 */

/**
 * @openapi
 * /api/payment/methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: Lista métodos de pagamento ativos (para o checkout)
 *     responses:
 *       200:
 *         description: Lista de métodos ativos ordenados por sort_order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 methods:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentMethod'
 */

/**
 * @openapi
 * /api/payment/admin/payment-methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: (Admin) Lista todos os métodos (ativos e inativos)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista completa ordenada por sort_order
 *
 *   post:
 *     tags: [Pagamentos]
 *     summary: (Admin) Cria um método de pagamento
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Criado
 *
 * /api/payment/admin/payment-methods/{id}:
 *   put:
 *     tags: [Pagamentos]
 *     summary: (Admin) Atualiza um método
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [Pagamentos]
 *     summary: (Admin) Desativa (soft delete) um método
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/payment/start:
 *   post:
 *     tags: [Pagamentos]
 *     summary: Inicia o fluxo de pagamento via Mercado Pago
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId]
 *             properties:
 *               pedidoId: { type: integer, example: 123 }
 *     responses:
 *       200:
 *         description: Retorna dados da preferência de pagamento
 *       400:
 *         description: Campo pedidoId ausente/inválido ou forma_pagamento incompatível com MP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       404:
 *         description: Pedido não encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       500:
 *         description: Erro ao iniciar pagamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
