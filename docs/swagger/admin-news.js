/**
 * @openapi
 * /api/admin/news/clima:
 *   get:
 *     tags: [Admin - News/Clima]
 *     summary: Listar estacoes de clima configuradas
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de estacoes }
 *   post:
 *     tags: [Admin - News/Clima]
 *     summary: Adicionar estacao de clima
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Estacao criada }
 *
 * /api/admin/news/clima/config:
 *   get:
 *     tags: [Admin - News/Clima]
 *     summary: Obter configuracao de sync do clima
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Config de sync }
 *   put:
 *     tags: [Admin - News/Clima]
 *     summary: Atualizar configuracao de sync do clima
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Config atualizada }
 *
 * /api/admin/news/clima/stations:
 *   get:
 *     tags: [Admin - News/Clima]
 *     summary: Listar estacoes INMET disponiveis
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Estacoes INMET }
 *
 * /api/admin/news/clima/sync-all:
 *   post:
 *     tags: [Admin - News/Clima]
 *     summary: Sincronizar todas as estacoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Resultado do sync }
 *
 * /api/admin/news/clima/{id}:
 *   put:
 *     tags: [Admin - News/Clima]
 *     summary: Atualizar estacao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - News/Clima]
 *     summary: Remover estacao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/news/clima/{id}/sync:
 *   post:
 *     tags: [Admin - News/Clima]
 *     summary: Sincronizar estacao individual
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Sincronizada }
 *
 * /api/admin/news/cotacoes:
 *   get:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Listar cotacoes configuradas
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de cotacoes }
 *   post:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Adicionar cotacao
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Cotacao criada }
 *
 * /api/admin/news/cotacoes/config:
 *   get:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Obter configuracao de sync de cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Config de sync }
 *   put:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Atualizar configuracao de sync de cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Config atualizada }
 *
 * /api/admin/news/cotacoes/meta:
 *   get:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Metadados de providers de cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Metadados }
 *
 * /api/admin/news/cotacoes/sync-all:
 *   post:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Sincronizar todas as cotacoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Resultado do sync }
 *
 * /api/admin/news/cotacoes/{id}:
 *   put:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Atualizar cotacao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Remover cotacao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/news/cotacoes/{id}/sync:
 *   post:
 *     tags: [Admin - News/Cotacoes]
 *     summary: Sincronizar cotacao individual
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Sincronizada }
 *
 * /api/admin/news/posts:
 *   get:
 *     tags: [Admin - News/Posts]
 *     summary: Listar posts de noticias
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de posts }
 *   post:
 *     tags: [Admin - News/Posts]
 *     summary: Criar post
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Post criado }
 *
 * /api/admin/news/posts/{id}:
 *   put:
 *     tags: [Admin - News/Posts]
 *     summary: Atualizar post
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - News/Posts]
 *     summary: Excluir post
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/news/upload/cover:
 *   post:
 *     tags: [Admin - News/Posts]
 *     summary: Upload de capa para post
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Capa enviada }
 */
