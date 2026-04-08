/**
 * @openapi
 * /api/admin/produtos:
 *   get:
 *     tags: [Admin - Produtos]
 *     summary: Listar produtos
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Lista paginada }
 *   post:
 *     tags: [Admin - Produtos]
 *     summary: Criar produto
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, price, quantity]
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               quantity: { type: integer }
 *               category_id: { type: integer }
 *               description: { type: string }
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Criado }
 * /api/admin/produtos/{id}:
 *   get:
 *     tags: [Admin - Produtos]
 *     summary: Detalhe do produto
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Produto }
 *       404: { description: Nao encontrado }
 *   put:
 *     tags: [Admin - Produtos]
 *     summary: Atualizar produto
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Produtos]
 *     summary: Excluir produto
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       204: { description: Removido }
 * /api/admin/produtos/{id}/status:
 *   patch:
 *     tags: [Admin - Produtos]
 *     summary: Alterar status (ativo/inativo)
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Status alterado }
 */
