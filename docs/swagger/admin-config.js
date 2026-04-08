/**
 * @openapi
 * /api/admin/config:
 *   get:
 *     tags: [Admin - Config]
 *     summary: Obter configuracoes da loja
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Configuracoes } }
 *   put:
 *     tags: [Admin - Config]
 *     summary: Atualizar configuracoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/config/categories:
 *   get:
 *     tags: [Admin - Config]
 *     summary: Listar categorias de config
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Config]
 *     summary: Criar categoria de config
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/config/categories/{id}:
 *   put:
 *     tags: [Admin - Config]
 *     summary: Atualizar categoria de config
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
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
 *     responses: { 200: { description: Logo atualizado } }
 *
 * /api/admin/shipping/zones:
 *   get:
 *     tags: [Admin - Shipping]
 *     summary: Listar zonas de frete
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Shipping]
 *     summary: Criar zona de frete
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/shipping/zones/{id}:
 *   put:
 *     tags: [Admin - Shipping]
 *     summary: Atualizar zona de frete
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Shipping]
 *     summary: Excluir zona de frete
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 *
 * /api/admin/comunicacao/templates:
 *   get:
 *     tags: [Admin - Comunicacao]
 *     summary: Listar templates de comunicacao
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Templates } }
 * /api/admin/comunicacao/email:
 *   post:
 *     tags: [Admin - Comunicacao]
 *     summary: Enviar email com template
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Enviado } }
 * /api/admin/comunicacao/whatsapp:
 *   post:
 *     tags: [Admin - Comunicacao]
 *     summary: Gerar link WhatsApp com template
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Link gerado } }
 */
