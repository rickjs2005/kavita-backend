/**
 * @openapi
 * /api/admin/site-hero:
 *   get:
 *     tags: [Admin - Hero]
 *     summary: Obter hero do site
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Hero } }
 *   put:
 *     tags: [Admin - Hero]
 *     summary: Atualizar hero
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/hero-slides:
 *   get:
 *     tags: [Admin - Hero Slides]
 *     summary: Listar slides
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Hero Slides]
 *     summary: Criar slide
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/hero-slides/{id}:
 *   get:
 *     tags: [Admin - Hero Slides]
 *     summary: Detalhe do slide
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Slide } }
 *   put:
 *     tags: [Admin - Hero Slides]
 *     summary: Atualizar slide
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Hero Slides]
 *     summary: Excluir slide
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/hero-slides/{id}/toggle:
 *   patch:
 *     tags: [Admin - Hero Slides]
 *     summary: Ativar/desativar slide
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Alterado } }
 * /api/admin/colaboradores:
 *   post:
 *     tags: [Admin - Colaboradores]
 *     summary: Cadastrar colaborador
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/colaboradores/public:
 *   post:
 *     tags: [Admin - Colaboradores]
 *     summary: Auto-cadastro publico
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Solicitacao enviada } }
 * /api/admin/colaboradores/pending:
 *   get:
 *     tags: [Admin - Colaboradores]
 *     summary: Listar pendentes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/colaboradores/{id}/verify:
 *   put:
 *     tags: [Admin - Colaboradores]
 *     summary: Verificar colaborador
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Verificado } }
 * /api/admin/colaboradores/{id}:
 *   delete:
 *     tags: [Admin - Colaboradores]
 *     summary: Excluir colaborador
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/servicos:
 *   get:
 *     tags: [Admin - Servicos]
 *     summary: Listar servicos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Servicos]
 *     summary: Criar servico
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/servicos/{id}:
 *   put:
 *     tags: [Admin - Servicos]
 *     summary: Atualizar servico
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Servicos]
 *     summary: Excluir servico
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/servicos/{id}/verificado:
 *   patch:
 *     tags: [Admin - Servicos]
 *     summary: Alterar verificacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Alterado } }
 * /api/admin/servicos/solicitacoes:
 *   get:
 *     tags: [Admin - Solicitacoes]
 *     summary: Listar solicitacoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/servicos/solicitacoes/{id}/status:
 *   patch:
 *     tags: [Admin - Solicitacoes]
 *     summary: Atualizar status da solicitacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 * /api/admin/especialidades:
 *   get:
 *     tags: [Admin - Especialidades]
 *     summary: Listar especialidades
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 */
