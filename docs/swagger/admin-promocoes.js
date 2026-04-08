/**
 * @openapi
 * /api/admin/marketing/promocoes:
 *   get:
 *     tags: [Admin - Promocoes]
 *     summary: Listar promocoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de promocoes }
 *   post:
 *     tags: [Admin - Promocoes]
 *     summary: Criar promocao
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id, discount_type, discount_value, start_date, end_date]
 *             properties:
 *               product_id: { type: integer }
 *               discount_type: { type: string, enum: [percentual, fixo] }
 *               discount_value: { type: number }
 *               start_date: { type: string, format: date-time }
 *               end_date: { type: string, format: date-time }
 *     responses:
 *       201: { description: Promocao criada }
 *
 * /api/admin/marketing/promocoes/{id}:
 *   put:
 *     tags: [Admin - Promocoes]
 *     summary: Atualizar promocao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - Promocoes]
 *     summary: Excluir promocao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 */
