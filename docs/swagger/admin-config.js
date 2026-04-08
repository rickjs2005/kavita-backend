/**
 * @openapi
 * /api/admin/config:
 *   get:
 *     tags: [Admin - Config]
 *     summary: Obter configuracoes da loja
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Configuracoes atuais }
 *   put:
 *     tags: [Admin - Config]
 *     summary: Atualizar configuracoes da loja
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Configuracoes atualizadas }
 *
 * /api/admin/config/categories:
 *   get:
 *     tags: [Admin - Config]
 *     summary: Listar categorias de config
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de categorias }
 *   post:
 *     tags: [Admin - Config]
 *     summary: Criar categoria de config
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Criada }
 *
 * /api/admin/config/categories/{id}:
 *   put:
 *     tags: [Admin - Config]
 *     summary: Atualizar categoria de config
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *
 * /api/admin/shop-config/upload/logo:
 *   post:
 *     tags: [Admin - Config]
 *     summary: Upload do logo da loja
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo: { type: string, format: binary }
 *     responses:
 *       200: { description: Logo atualizado }
 */
