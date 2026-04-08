/**
 * @openapi
 * /api/admin/site-hero:
 *   get:
 *     tags: [Admin - Hero]
 *     summary: Obter hero principal do site
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Hero data }
 *   put:
 *     tags: [Admin - Hero]
 *     summary: Atualizar hero do site (com upload)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               heroImage: { type: string, format: binary }
 *               heroVideo: { type: string, format: binary }
 *     responses:
 *       200: { description: Hero atualizado }
 *
 * /api/admin/hero-slides:
 *   get:
 *     tags: [Admin - Hero Slides]
 *     summary: Listar slides do hero
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de slides }
 *   post:
 *     tags: [Admin - Hero Slides]
 *     summary: Criar slide
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               desktop_image: { type: string, format: binary }
 *               mobile_image: { type: string, format: binary }
 *     responses:
 *       201: { description: Slide criado }
 *
 * /api/admin/hero-slides/{id}:
 *   get:
 *     tags: [Admin - Hero Slides]
 *     summary: Detalhe do slide
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Slide }
 *   put:
 *     tags: [Admin - Hero Slides]
 *     summary: Atualizar slide
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Hero Slides]
 *     summary: Excluir slide
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/hero-slides/{id}/toggle:
 *   patch:
 *     tags: [Admin - Hero Slides]
 *     summary: Ativar/desativar slide
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status alterado }
 *
 * /api/admin/colaboradores:
 *   post:
 *     tags: [Admin - Colaboradores]
 *     summary: Cadastrar colaborador (admin)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               whatsapp: { type: string }
 *               imagem: { type: string, format: binary }
 *     responses:
 *       201: { description: Colaborador criado }
 *
 * /api/admin/colaboradores/public:
 *   post:
 *     tags: [Admin - Colaboradores]
 *     summary: Auto-cadastro publico de colaborador
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Solicitacao enviada }
 *
 * /api/admin/colaboradores/pending:
 *   get:
 *     tags: [Admin - Colaboradores]
 *     summary: Listar colaboradores pendentes de verificacao
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de pendentes }
 *
 * /api/admin/colaboradores/{id}/verify:
 *   put:
 *     tags: [Admin - Colaboradores]
 *     summary: Verificar/aprovar colaborador
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Verificado }
 *
 * /api/admin/colaboradores/{id}:
 *   delete:
 *     tags: [Admin - Colaboradores]
 *     summary: Excluir colaborador
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/servicos:
 *   get:
 *     tags: [Admin - Servicos]
 *     summary: Listar servicos
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de servicos }
 *   post:
 *     tags: [Admin - Servicos]
 *     summary: Criar servico
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Servico criado }
 *
 * /api/admin/servicos/{id}:
 *   put:
 *     tags: [Admin - Servicos]
 *     summary: Atualizar servico
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Servicos]
 *     summary: Excluir servico
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/servicos/{id}/verificado:
 *   patch:
 *     tags: [Admin - Servicos]
 *     summary: Alterar status de verificacao do servico
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status alterado }
 *
 * /api/admin/servicos/solicitacoes:
 *   get:
 *     tags: [Admin - Solicitacoes]
 *     summary: Listar solicitacoes de servico
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de solicitacoes }
 *
 * /api/admin/servicos/solicitacoes/{id}/status:
 *   patch:
 *     tags: [Admin - Solicitacoes]
 *     summary: Atualizar status da solicitacao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status atualizado }
 *
 * /api/admin/especialidades:
 *   get:
 *     tags: [Admin - Especialidades]
 *     summary: Listar especialidades
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista }
 *
 * /api/admin/comunicacao/templates:
 *   get:
 *     tags: [Admin - Comunicacao]
 *     summary: Listar templates de comunicacao disponiveis
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Templates de email e whatsapp }
 *
 * /api/admin/comunicacao/email:
 *   post:
 *     tags: [Admin - Comunicacao]
 *     summary: Enviar email com template
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId, template]
 *             properties:
 *               pedidoId: { type: integer }
 *               template: { type: string }
 *     responses:
 *       200: { description: Email enviado }
 *
 * /api/admin/comunicacao/whatsapp:
 *   post:
 *     tags: [Admin - Comunicacao]
 *     summary: Gerar link WhatsApp com template
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId, template]
 *             properties:
 *               pedidoId: { type: integer }
 *               template: { type: string }
 *     responses:
 *       200: { description: Link gerado }
 *
 * /api/admin/shipping/zones:
 *   get:
 *     tags: [Admin - Shipping]
 *     summary: Listar zonas de frete
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de zonas }
 *   post:
 *     tags: [Admin - Shipping]
 *     summary: Criar zona de frete
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Zona criada }
 *
 * /api/admin/shipping/zones/{id}:
 *   put:
 *     tags: [Admin - Shipping]
 *     summary: Atualizar zona de frete
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - Shipping]
 *     summary: Excluir zona de frete
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/carrinhos:
 *   get:
 *     tags: [Admin - Carrinhos]
 *     summary: Listar carrinhos abandonados
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de carrinhos }
 *
 * /api/admin/carrinhos/{id}/notificar:
 *   post:
 *     tags: [Admin - Carrinhos]
 *     summary: Notificar cliente sobre carrinho abandonado
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Notificacao enviada }
 *
 * /api/admin/carrinhos/{id}/whatsapp-link:
 *   get:
 *     tags: [Admin - Carrinhos]
 *     summary: Gerar link WhatsApp para recuperacao de carrinho
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Link gerado }
 *
 * /api/admin/mercado-do-cafe:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Listar corretoras do Mercado do Cafe
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista paginada }
 *
 * /api/admin/mercado-do-cafe/corretoras:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Criar corretora
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Corretora criada }
 *
 * /api/admin/mercado-do-cafe/corretoras/{id}:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Detalhe da corretora
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Corretora }
 *   put:
 *     tags: [Admin - Corretoras]
 *     summary: Atualizar corretora
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *
 * /api/admin/mercado-do-cafe/corretoras/{id}/status:
 *   patch:
 *     tags: [Admin - Corretoras]
 *     summary: Alterar status da corretora
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status alterado }
 *
 * /api/admin/mercado-do-cafe/corretoras/{id}/featured:
 *   patch:
 *     tags: [Admin - Corretoras]
 *     summary: Marcar/desmarcar corretora como destaque
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status alterado }
 *
 * /api/admin/mercado-do-cafe/submissions:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Listar submissoes de corretoras
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de submissoes }
 *
 * /api/admin/mercado-do-cafe/submissions/pending-count:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Contar submissoes pendentes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Contagem }
 *
 * /api/admin/mercado-do-cafe/submissions/{id}:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Detalhe da submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Submissao }
 *
 * /api/admin/mercado-do-cafe/submissions/{id}/approve:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Aprovar submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Aprovada }
 *
 * /api/admin/mercado-do-cafe/submissions/{id}/reject:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Rejeitar submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Rejeitada }
 */
