/**
 * @openapi
 * /api/admin/categorias:
 *   get:
 *     tags: [Admin - Categorias]
 *     summary: Listar categorias
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de categorias }
 *   post:
 *     tags: [Admin - Categorias]
 *     summary: Criar categoria
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome: { type: string }
 *               slug: { type: string }
 *     responses:
 *       201: { description: Categoria criada }
 *
 * /api/admin/categorias/{id}:
 *   put:
 *     tags: [Admin - Categorias]
 *     summary: Atualizar categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - Categorias]
 *     summary: Excluir categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/categorias/{id}/status:
 *   patch:
 *     tags: [Admin - Categorias]
 *     summary: Alterar status da categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status atualizado }
 */
