/**
 * @openapi
 * /api/admin/stats/resumo:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Resumo geral
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Resumo } }
 * /api/admin/stats/vendas:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Vendas por periodo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: inicio, in: query, schema: { type: string, format: date } }
 *       - { name: fim, in: query, schema: { type: string, format: date } }
 *     responses: { 200: { description: Vendas } }
 * /api/admin/stats/produtos-mais-vendidos:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Produtos mais vendidos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Ranking } }
 * /api/admin/stats/alertas:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Alertas operacionais
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Alertas } }
 * /api/admin/relatorios/vendas:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de vendas
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Relatorio } }
 * /api/admin/relatorios/produtos-mais-vendidos:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Produtos mais vendidos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Ranking } }
 * /api/admin/relatorios/clientes-top:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Clientes com mais compras
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Top clientes } }
 * /api/admin/relatorios/estoque:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de estoque
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Estoque } }
 * /api/admin/relatorios/estoque-baixo:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Produtos com estoque baixo
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Estoque baixo } }
 * /api/admin/relatorios/servicos:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de servicos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Servicos } }
 * /api/admin/relatorios/servicos-ranking:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Ranking de servicos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Ranking } }
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Listar usuarios
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses: { 200: { description: Lista paginada } }
 * /api/admin/users/{id}/block:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Bloquear/desbloquear usuario
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Alterado } }
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Excluir usuario
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/admins:
 *   get:
 *     tags: [Admin - Admins]
 *     summary: Listar admins
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Admins]
 *     summary: Criar admin
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha, nome, role_id]
 *             properties:
 *               email: { type: string }
 *               senha: { type: string }
 *               nome: { type: string }
 *               role_id: { type: integer }
 *     responses: { 201: { description: Criado } }
 * /api/admin/admins/{id}:
 *   put:
 *     tags: [Admin - Admins]
 *     summary: Atualizar admin
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Admins]
 *     summary: Excluir admin
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/roles:
 *   get:
 *     tags: [Admin - Roles]
 *     summary: Listar roles
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Roles]
 *     summary: Criar role
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/admin/roles/{id}:
 *   get:
 *     tags: [Admin - Roles]
 *     summary: Detalhe do role com permissoes
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Role } }
 *   put:
 *     tags: [Admin - Roles]
 *     summary: Atualizar role
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [Admin - Roles]
 *     summary: Excluir role
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 * /api/admin/permissions:
 *   get:
 *     tags: [Admin - Permissions]
 *     summary: Listar permissoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [Admin - Permissions]
 *     summary: Criar permissao
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/permissions/{id}:
 *   put:
 *     tags: [Admin - Permissions]
 *     summary: Atualizar permissao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 *   delete:
 *     tags: [Admin - Permissions]
 *     summary: Excluir permissao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removida } }
 * /api/admin/logs:
 *   get:
 *     tags: [Admin - Logs]
 *     summary: Listar logs de auditoria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *     responses: { 200: { description: Logs } }
 * /api/admin/logs/{id}:
 *   get:
 *     tags: [Admin - Logs]
 *     summary: Detalhe do log
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Log } }
 * /api/admin/carrinhos:
 *   get:
 *     tags: [Admin - Carrinhos]
 *     summary: Listar carrinhos abandonados
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/carrinhos/{id}/notificar:
 *   post:
 *     tags: [Admin - Carrinhos]
 *     summary: Notificar sobre carrinho abandonado
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Notificado } }
 * /api/admin/carrinhos/{id}/whatsapp-link:
 *   get:
 *     tags: [Admin - Carrinhos]
 *     summary: Link WhatsApp para recuperacao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Link } }
 * /api/admin/mercado-do-cafe:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Listar corretoras
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/mercado-do-cafe/corretoras:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Criar corretora
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criada } }
 * /api/admin/mercado-do-cafe/corretoras/{id}:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Detalhe da corretora
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Corretora } }
 *   put:
 *     tags: [Admin - Corretoras]
 *     summary: Atualizar corretora
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizada } }
 * /api/admin/mercado-do-cafe/corretoras/{id}/status:
 *   patch:
 *     tags: [Admin - Corretoras]
 *     summary: Alterar status
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Alterado } }
 * /api/admin/mercado-do-cafe/corretoras/{id}/featured:
 *   patch:
 *     tags: [Admin - Corretoras]
 *     summary: Marcar como destaque
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Alterado } }
 * /api/admin/mercado-do-cafe/submissions:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Listar submissoes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 * /api/admin/mercado-do-cafe/submissions/pending-count:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Contar pendentes
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Contagem } }
 * /api/admin/mercado-do-cafe/submissions/{id}:
 *   get:
 *     tags: [Admin - Corretoras]
 *     summary: Detalhe da submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Submissao } }
 * /api/admin/mercado-do-cafe/submissions/{id}/approve:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Aprovar submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Aprovada } }
 * /api/admin/mercado-do-cafe/submissions/{id}/reject:
 *   post:
 *     tags: [Admin - Corretoras]
 *     summary: Rejeitar submissao
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Rejeitada } }
 */
