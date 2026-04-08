/**
 * @openapi
 * /api/admin/cupons:
 *   get:
 *     tags: [Admin - Cupons]
 *     summary: Listar cupons
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de cupons }
 *   post:
 *     tags: [Admin - Cupons]
 *     summary: Criar cupom
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, tipo, valor]
 *             properties:
 *               codigo: { type: string }
 *               tipo: { type: string, enum: [percentual, fixo] }
 *               valor: { type: number }
 *               minimo: { type: number }
 *               max_usos: { type: integer }
 *               expiracao: { type: string, format: date }
 *     responses:
 *       201: { description: Cupom criado }
 *
 * /api/admin/cupons/{id}:
 *   put:
 *     tags: [Admin - Cupons]
 *     summary: Atualizar cupom
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Cupons]
 *     summary: Excluir cupom
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 */
