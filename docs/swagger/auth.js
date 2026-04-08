/**
 * @openapi
 * /api/csrf-token:
 *   get:
 *     tags: [Auth]
 *     summary: Obter token CSRF
 *     description: Retorna token CSRF e define cookie csrf_token. Chamar antes de qualquer mutacao.
 *     responses:
 *       200:
 *         description: Token CSRF gerado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken: { type: string }
 *
 * /api/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login de usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email: { type: string, format: email }
 *               senha: { type: string }
 *     responses:
 *       200: { description: Login bem-sucedido, cookie auth_token definido }
 *       401: { description: Credenciais invalidas }
 *
 * /api/admin/login:
 *   post:
 *     tags: [Auth - Admin]
 *     summary: Login de admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email: { type: string, format: email }
 *               senha: { type: string }
 *     responses:
 *       200: { description: Login bem-sucedido ou MFA requerido }
 *       401: { description: Credenciais invalidas }
 *       429: { description: Conta bloqueada por tentativas }
 *
 * /api/admin/login/mfa:
 *   post:
 *     tags: [Auth - Admin]
 *     summary: Validar codigo MFA
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [challengeId, code]
 *             properties:
 *               challengeId: { type: string }
 *               code: { type: string }
 *     responses:
 *       200: { description: MFA validado, cookie adminToken definido }
 *       401: { description: Codigo invalido }
 *
 * /api/admin/me:
 *   get:
 *     tags: [Auth - Admin]
 *     summary: Dados do admin autenticado
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Dados do admin }
 *       401: { description: Nao autenticado }
 *
 * /api/admin/logout:
 *   post:
 *     tags: [Auth - Admin]
 *     summary: Logout admin (revoga sessao via tokenVersion)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Deslogado }
 *
 * /api/users/me:
 *   get:
 *     tags: [User Profile]
 *     summary: Dados do usuario autenticado
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Perfil do usuario }
 *   put:
 *     tags: [User Profile]
 *     summary: Atualizar perfil do usuario
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Perfil atualizado }
 *
 * /api/users/admin/{id}:
 *   get:
 *     tags: [User Profile]
 *     summary: Dados de usuario (visao admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Dados do usuario }
 *   put:
 *     tags: [User Profile]
 *     summary: Atualizar usuario (admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *
 * /api/users/addresses:
 *   get:
 *     tags: [User Addresses]
 *     summary: Listar enderecos do usuario
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de enderecos }
 *   post:
 *     tags: [User Addresses]
 *     summary: Adicionar endereco
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Endereco criado }
 *
 * /api/users/addresses/{id}:
 *   put:
 *     tags: [User Addresses]
 *     summary: Atualizar endereco
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     tags: [User Addresses]
 *     summary: Excluir endereco
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 */
