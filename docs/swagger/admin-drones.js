/**
 * @openapi
 * /api/admin/drones/page:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter conteudo da pagina de drones
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Conteudo da pagina }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar conteudo da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Atualizado }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar conteudo da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Criado }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover conteudo da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/drones/page-settings:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter configuracoes da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Configuracoes }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar configuracoes da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Atualizado }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar configuracoes da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Criado }
 *
 * /api/admin/drones/config:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter config geral de drones
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Config }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar config geral
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Atualizada }
 *
 * /api/admin/drones/models:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar modelos de drone
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de modelos }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar modelo de drone
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Modelo criado }
 *
 * /api/admin/drones/models/{modelKey}:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Detalhe do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Modelo }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/drones/models/{modelKey}/gallery:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Imagens da galeria }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Upload de imagem para galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Imagem adicionada }
 *
 * /api/admin/drones/models/{modelKey}/gallery/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover imagem da galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/drones/models/{modelKey}/media-selection:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar selecao de midia do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Selecao atualizada }
 *
 * /api/admin/drones/galeria:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar galeria geral de drones
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Galeria }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Upload para galeria geral
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Adicionada }
 *
 * /api/admin/drones/galeria/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover imagem da galeria geral
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/drones/representantes:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar representantes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de representantes }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar representante
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Representante criado }
 *
 * /api/admin/drones/representantes/{id}:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar representante
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir representante
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/drones/comentarios:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar comentarios de drones
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de comentarios }
 *
 * /api/admin/drones/comentarios/{id}/aprovar:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Aprovar comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Aprovado }
 *
 * /api/admin/drones/comentarios/{id}/reprovar:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Reprovar comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Reprovado }
 *
 * /api/admin/drones/comentarios/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 */
