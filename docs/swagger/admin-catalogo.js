/**
 * @openapi
 * /api/admin/categorias:
 *   get:
 *     tags: [Admin - Categorias]
 *     summary: Listar categorias
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Categorias]
 *     summary: Criar categoria
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/categorias/{id}:
 *   put:
 *     tags: [Admin - Categorias]
 *     summary: Atualizar categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Categorias]
 *     summary: Excluir categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 * /api/admin/categorias/{id}/status:
 *   patch:
 *     tags: [Admin - Categorias]
 *     summary: Alterar status da categoria
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Status alterado } }
 *
 * /api/admin/marketing/promocoes:
 *   get:
 *     tags: [Admin - Promocoes]
 *     summary: Listar promocoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Promocoes]
 *     summary: Criar promocao
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/marketing/promocoes/{id}:
 *   put:
 *     tags: [Admin - Promocoes]
 *     summary: Atualizar promocao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Promocoes]
 *     summary: Excluir promocao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 *
 * /api/admin/cupons:
 *   get:
 *     tags: [Admin - Cupons]
 *     summary: Listar cupons
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Cupons]
 *     summary: Criar cupom
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/cupons/{id}:
 *   put:
 *     tags: [Admin - Cupons]
 *     summary: Atualizar cupom
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Cupons]
 *     summary: Excluir cupom
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 */
