/**
 * @openapi
 * /api/favorites:
 *   get:
 *     tags: [Favorites]
 *     summary: Listar favoritos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Favorites]
 *     summary: Adicionar favorito
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: integer }
 *     responses:
 *       201: { description: Adicionado }
 *       409: { description: Ja existe }
 * /api/favorites/{productId}:
 *   delete:
 *     tags: [Favorites]
 *     summary: Remover favorito
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: productId, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/pedidos:
 *   get:
 *     tags: [Pedidos]
 *     summary: Listar pedidos do usuario
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista de pedidos } }
 * /api/pedidos/{id}:
 *   get:
 *     tags: [Pedidos]
 *     summary: Detalhe do pedido
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Pedido com itens }
 *       404: { description: Nao encontrado }
 * /api/payment/admin/payment-methods:
 *   post:
 *     tags: [Payment - Admin]
 *     summary: Criar metodo de pagamento
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/payment/admin/payment-methods/{id}:
 *   put:
 *     tags: [Payment - Admin]
 *     summary: Atualizar metodo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Payment - Admin]
 *     summary: Desativar metodo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Desativado } }
 * /api/payment/webhook:
 *   post:
 *     tags: [Payment]
 *     summary: Webhook Mercado Pago
 *     description: Validado via HMAC-SHA256. Idempotente por event_id.
 *     responses:
 *       200: { description: Processado }
 *       401: { description: Assinatura invalida }
 *       500: { description: Erro transitorio — MP retenta }
 */
