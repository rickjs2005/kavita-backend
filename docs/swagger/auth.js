/**
 * @openapi
 * /api/csrf-token:
 *   get:
 *     tags: [Auth]
 *     summary: Obter token CSRF
 *     responses: { 200: { description: Token CSRF gerado } }
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
 *       200: { description: Login OK — cookie auth_token definido }
 *       401: { description: Credenciais invalidas }
 *       429: { description: Conta bloqueada }
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
 *               email: { type: string }
 *               senha: { type: string }
 *     responses:
 *       200: { description: Login OK ou MFA requerido }
 *       401: { description: Credenciais invalidas }
 *       429: { description: Conta bloqueada }
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
 *       200: { description: MFA validado — cookie adminToken definido }
 *       401: { description: Codigo invalido ou expirado }
 * /api/admin/me:
 *   get:
 *     tags: [Auth - Admin]
 *     summary: Dados do admin autenticado
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Admin com permissoes }
 *       401: { description: Nao autenticado }
 * /api/admin/logout:
 *   post:
 *     tags: [Auth - Admin]
 *     summary: Logout admin (revoga sessao)
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Deslogado } }
 * /api/users/me:
 *   get:
 *     tags: [User Profile]
 *     summary: Perfil do usuario autenticado
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Perfil } }
 *   put:
 *     tags: [User Profile]
 *     summary: Atualizar perfil
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Atualizado } }
 * /api/users/admin/{id}:
 *   get:
 *     tags: [User Profile]
 *     summary: Dados de usuario (visao admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Usuario } }
 *   put:
 *     tags: [User Profile]
 *     summary: Atualizar usuario (admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 * /api/users/addresses:
 *   get:
 *     tags: [User Addresses]
 *     summary: Listar enderecos
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: Lista } }
 *   post:
 *     tags: [User Addresses]
 *     summary: Adicionar endereco
 *     security: [{ BearerAuth: [] }]
 *     responses: { 201: { description: Criado } }
 * /api/users/addresses/{id}:
 *   put:
 *     tags: [User Addresses]
 *     summary: Atualizar endereco
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Atualizado } }
 *   delete:
 *     tags: [User Addresses]
 *     summary: Excluir endereco
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 204: { description: Removido } }
 */
