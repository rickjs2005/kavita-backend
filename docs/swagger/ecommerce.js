/**
 * @openapi
 * /api/favorites:
 *   get:
 *     tags: [Favorites]
 *     summary: Listar favoritos do usuario
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de favoritos }
 *   post:
 *     tags: [Favorites]
 *     summary: Adicionar produto aos favoritos
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: integer }
 *     responses:
 *       201: { description: Adicionado }
 *       409: { description: Ja esta nos favoritos }
 *
 * /api/favorites/{productId}:
 *   delete:
 *     tags: [Favorites]
 *     summary: Remover produto dos favoritos
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: productId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/pedidos:
 *   get:
 *     tags: [Pedidos (User)]
 *     summary: Listar pedidos do usuario autenticado
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de pedidos }
 *
 * /api/pedidos/{id}:
 *   get:
 *     tags: [Pedidos (User)]
 *     summary: Detalhe de um pedido do usuario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Pedido com itens }
 *       404: { description: Nao encontrado }
 *
 * /api/payment/admin/payment-methods:
 *   post:
 *     tags: [Payment - Admin]
 *     summary: Criar metodo de pagamento
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, tipo]
 *             properties:
 *               nome: { type: string }
 *               tipo: { type: string }
 *               ativo: { type: boolean }
 *     responses:
 *       201: { description: Metodo criado }
 *
 * /api/payment/admin/payment-methods/{id}:
 *   put:
 *     tags: [Payment - Admin]
 *     summary: Atualizar metodo de pagamento
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Payment - Admin]
 *     summary: Desativar metodo de pagamento
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Desativado }
 *
 * /api/payment/webhook:
 *   post:
 *     tags: [Payment]
 *     summary: Webhook do Mercado Pago
 *     description: Recebe notificacoes de pagamento. Validado via HMAC-SHA256 (x-signature). Idempotente por event_id.
 *     responses:
 *       200: { description: Evento processado ou ignorado }
 *       401: { description: Assinatura invalida }
 *       500: { description: Erro transitorio (MP retenta) }
 */
