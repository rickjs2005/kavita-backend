/**
 * @openapi
 * /api/admin/drones/page:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter conteudo da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Pagina } }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar pagina
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar pagina
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover pagina
 *     security: [{ BearerAuth: [] }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/drones/page-settings:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter configuracoes da pagina
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Settings } }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar configuracoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar configuracoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/drones/config:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Obter config geral
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Config } }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar config
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/drones/models:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar modelos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar modelo
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/drones/models/{modelKey}:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Detalhe do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Modelo } }
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/drones/models/{modelKey}/gallery:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Imagens } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Upload para galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 201: { description: Adicionada } }
 * /api/admin/drones/models/{modelKey}/gallery/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover imagem da galeria do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: modelKey, in: path, required: true, schema: { type: string } }
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses: { 204: { description: Removida } }
 * /api/admin/drones/models/{modelKey}/media-selection:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar selecao de midia do modelo
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: modelKey, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/drones/galeria:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Galeria geral
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Galeria } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Upload para galeria geral
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Adicionada } }
 * /api/admin/drones/galeria/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Remover da galeria geral
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 * /api/admin/drones/representantes:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar representantes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Drones]
 *     summary: Criar representante
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/drones/representantes/{id}:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Atualizar representante
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir representante
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/drones/comentarios:
 *   get:
 *     tags: [Admin - Drones]
 *     summary: Listar comentarios
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/drones/comentarios/{id}/aprovar:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Aprovar comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Aprovado } }
 * /api/admin/drones/comentarios/{id}/reprovar:
 *   put:
 *     tags: [Admin - Drones]
 *     summary: Reprovar comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Reprovado } }
 * /api/admin/drones/comentarios/{id}:
 *   delete:
 *     tags: [Admin - Drones]
 *     summary: Excluir comentario
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 */
