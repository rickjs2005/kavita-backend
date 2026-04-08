/**
 * @openapi
 * /api/admin/stats/resumo:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Resumo geral (totais de pedidos, faturamento, usuarios)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Resumo }
 *
 * /api/admin/stats/vendas:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Vendas por periodo
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: inicio, in: query, schema: { type: string, format: date } }
 *       - { name: fim, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Dados de vendas }
 *
 * /api/admin/stats/produtos-mais-vendidos:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Produtos mais vendidos
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Ranking de produtos }
 *
 * /api/admin/stats/alertas:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Alertas operacionais (estoque baixo, pedidos pendentes)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de alertas }
 *
 * /api/admin/relatorios/vendas:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de vendas
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: inicio, in: query, schema: { type: string, format: date } }
 *       - { name: fim, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Relatorio }
 *
 * /api/admin/relatorios/produtos-mais-vendidos:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Produtos mais vendidos (relatorio)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Ranking }
 *
 * /api/admin/relatorios/clientes-top:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Clientes com mais compras
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Top clientes }
 *
 * /api/admin/relatorios/estoque:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de estoque completo
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Estoque }
 *
 * /api/admin/relatorios/estoque-baixo:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Produtos com estoque baixo
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Produtos com estoque baixo }
 *
 * /api/admin/relatorios/servicos:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Relatorio de servicos
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Servicos }
 *
 * /api/admin/relatorios/servicos-ranking:
 *   get:
 *     tags: [Admin - Relatorios]
 *     summary: Ranking de servicos
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Ranking }
 *
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Listar usuarios do sistema
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Lista paginada }
 *
 * /api/admin/users/{id}/block:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Bloquear/desbloquear usuario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Status atualizado }
 *
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Excluir usuario
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/admins:
 *   get:
 *     tags: [Admin - Admins]
 *     summary: Listar contas admin
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de admins }
 *   post:
 *     tags: [Admin - Admins]
 *     summary: Criar conta admin
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
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
 *     responses:
 *       201: { description: Admin criado }
 *
 * /api/admin/admins/{id}:
 *   put:
 *     tags: [Admin - Admins]
 *     summary: Atualizar admin
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Admins]
 *     summary: Excluir admin
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/roles:
 *   get:
 *     tags: [Admin - Roles]
 *     summary: Listar roles
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de roles }
 *   post:
 *     tags: [Admin - Roles]
 *     summary: Criar role
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Role criado }
 *
 * /api/admin/roles/{id}:
 *   get:
 *     tags: [Admin - Roles]
 *     summary: Detalhe do role com permissoes
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Role com permissoes }
 *   put:
 *     tags: [Admin - Roles]
 *     summary: Atualizar role
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [Admin - Roles]
 *     summary: Excluir role
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *
 * /api/admin/permissions:
 *   get:
 *     tags: [Admin - Permissions]
 *     summary: Listar permissoes
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de permissoes }
 *   post:
 *     tags: [Admin - Permissions]
 *     summary: Criar permissao
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Permissao criada }
 *
 * /api/admin/permissions/{id}:
 *   put:
 *     tags: [Admin - Permissions]
 *     summary: Atualizar permissao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizada }
 *   delete:
 *     tags: [Admin - Permissions]
 *     summary: Excluir permissao
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *
 * /api/admin/logs:
 *   get:
 *     tags: [Admin - Logs]
 *     summary: Listar logs de auditoria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: Logs paginados }
 *
 * /api/admin/logs/{id}:
 *   get:
 *     tags: [Admin - Logs]
 *     summary: Detalhe do log
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Log }
 */
