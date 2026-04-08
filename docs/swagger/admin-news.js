/**
 * @openapi
 * /api/admin/news/clima:
 *   get:
 *     tags: [Admin - Clima]
 *     summary: Listar estacoes de clima
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Clima]
 *     summary: Adicionar estacao
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/news/clima/config:
 *   get:
 *     tags: [Admin - Clima]
 *     summary: Obter config de sync
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Config } }
 *   put:
 *     tags: [Admin - Clima]
 *     summary: Atualizar config de sync
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/news/clima/stations:
 *   get:
 *     tags: [Admin - Clima]
 *     summary: Listar estacoes INMET disponiveis
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Estacoes } }
 * /api/admin/news/clima/sync-all:
 *   post:
 *     tags: [Admin - Clima]
 *     summary: Sincronizar todas as estacoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Resultado } }
 * /api/admin/news/clima/{id}:
 *   put:
 *     tags: [Admin - Clima]
 *     summary: Atualizar estacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Clima]
 *     summary: Remover estacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 * /api/admin/news/clima/{id}/sync:
 *   post:
 *     tags: [Admin - Clima]
 *     summary: Sincronizar estacao individual
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Sincronizada } }
 * /api/admin/news/cotacoes:
 *   get:
 *     tags: [Admin - Cotacoes]
 *     summary: Listar cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Cotacoes]
 *     summary: Adicionar cotacao
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/news/cotacoes/config:
 *   get:
 *     tags: [Admin - Cotacoes]
 *     summary: Obter config de sync de cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Config } }
 *   put:
 *     tags: [Admin - Cotacoes]
 *     summary: Atualizar config de sync
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/news/cotacoes/meta:
 *   get:
 *     tags: [Admin - Cotacoes]
 *     summary: Metadados de providers
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Meta } }
 * /api/admin/news/cotacoes/sync-all:
 *   post:
 *     tags: [Admin - Cotacoes]
 *     summary: Sincronizar todas
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Resultado } }
 * /api/admin/news/cotacoes/{id}:
 *   put:
 *     tags: [Admin - Cotacoes]
 *     summary: Atualizar cotacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Cotacoes]
 *     summary: Remover cotacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 * /api/admin/news/cotacoes/{id}/sync:
 *   post:
 *     tags: [Admin - Cotacoes]
 *     summary: Sincronizar cotacao individual
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Sincronizada } }
 * /api/admin/news/posts:
 *   get:
 *     tags: [Admin - Posts]
 *     summary: Listar posts
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Posts]
 *     summary: Criar post
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/news/posts/{id}:
 *   put:
 *     tags: [Admin - Posts]
 *     summary: Atualizar post
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Posts]
 *     summary: Excluir post
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/news/upload/cover:
 *   post:
 *     tags: [Admin - Posts]
 *     summary: Upload de capa para post
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses: { 200: { description: Capa enviada } }
 */
