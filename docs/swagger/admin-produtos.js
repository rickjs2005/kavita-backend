/**
 * @openapi
 * /api/admin/produtos:
 *   get:
 *     tags: [Admin - Produtos]
 *     summary: Listar produtos (admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Lista paginada de produtos }
 *       401: { description: Nao autenticado }
 *   post:
 *     tags: [Admin - Produtos]
 *     summary: Criar produto
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               quantity: { type: integer }
 *               category_id: { type: integer }
 *               description: { type: string }
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Produto criado }
 *       400: { description: Dados invalidos }
 *
 * /api/admin/produtos/{id}:
 *   get:
 *     tags: [Admin - Produtos]
 *     summary: Detalhe do produto
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Produto encontrado }
 *       404: { description: Nao encontrado }
 *   put:
 *     tags: [Admin - Produtos]
 *     summary: Atualizar produto
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               quantity: { type: integer }
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       200: { description: Produto atualizado }
 *       404: { description: Nao encontrado }
 *   delete:
 *     tags: [Admin - Produtos]
 *     summary: Excluir produto
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *       404: { description: Nao encontrado }
 *
 * /api/admin/produtos/{id}/status:
 *   patch:
 *     tags: [Admin - Produtos]
 *     summary: Alterar status do produto (ativo/inativo)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status atualizado }
 */
