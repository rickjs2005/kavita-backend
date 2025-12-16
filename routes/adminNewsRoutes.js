// routes/adminNewsRoutes.js
const express = require("express");
const router = express.Router();

const adminNewsController = require("../controllers/adminNewsController");

/**
 * @openapi
 * tags:
 *   - name: Kavita News (Admin)
 *     description: Endpoints administrativos do Kavita News (painel, com autenticação)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     NewsClimaInput:
 *       type: object
 *       properties:
 *         city_name: { type: string, example: "Manhuaçu" }
 *         slug: { type: string, example: "manhuacu" }
 *         uf: { type: string, example: "MG" }
 *         mm_24h: { type: number, example: 12.3 }
 *         mm_7d: { type: number, example: 55.7 }
 *         source: { type: string, example: "INMET" }
 *         last_update_at: { type: string, example: "2025-12-16 10:30:00" }
 *         ativo: { type: integer, example: 1 }
 *     NewsCotacaoInput:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Café Arábica" }
 *         slug: { type: string, example: "cafe-arabica" }
 *         type: { type: string, example: "cafe" }
 *         price: { type: number, example: 1234.56 }
 *         unit: { type: string, example: "R$/sc 60kg" }
 *         variation_day: { type: number, example: -12.4 }
 *         market: { type: string, example: "CEPEA" }
 *         source: { type: string, example: "CEPEA" }
 *         last_update_at: { type: string, example: "2025-12-16 10:30:00" }
 *         ativo: { type: integer, example: 1 }
 *     NewsPostInput:
 *       type: object
 *       properties:
 *         title: { type: string, example: "Preço do café hoje em MG" }
 *         slug: { type: string, example: "preco-do-cafe-hoje-em-mg" }
 *         excerpt: { type: string, example: "Resumo curto do post..." }
 *         content: { type: string, example: "Conteúdo completo..." }
 *         cover_image_url: { type: string, example: "https://..." }
 *         category: { type: string, example: "cafe" }
 *         tags: { type: string, example: "cafe,mg,preco" }
 *         status: { type: string, example: "draft" }
 *         published_at: { type: string, example: "2025-12-16 10:30:00" }
 *         author_admin_id: { type: integer, example: 1 }
 */

/* =========================
 * CLIMA
 * ========================= */

/**
 * @openapi
 * /api/admin/news/clima:
 *   get:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Lista cidades de clima (admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista retornada com sucesso }
 *       401: { description: Não autorizado }
 *       403: { description: Sem permissão }
 *       500: { description: Erro interno }
 */
router.get("/clima", adminNewsController.listClima);

/**
 * @openapi
 * /api/admin/news/clima:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Cria um registro de clima
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsClimaInput'
 *     responses:
 *       201: { description: Criado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.post("/clima", adminNewsController.createClima);

/**
 * @openapi
 * /api/admin/news/clima/{id}:
 *   put:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Atualiza um registro de clima
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do registro."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsClimaInput'
 *     responses:
 *       200: { description: Atualizado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.put("/clima/:id", adminNewsController.updateClima);

/**
 * @openapi
 * /api/admin/news/clima/{id}:
 *   delete:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Remove um registro de clima
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do registro."
 *     responses:
 *       200: { description: Removido com sucesso }
 *       400: { description: ID inválido }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.delete("/clima/:id", adminNewsController.deleteClima);

/* =========================
 * COTAÇÕES
 * ========================= */

/**
 * @openapi
 * /api/admin/news/cotacoes:
 *   get:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Lista cotações (admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista retornada com sucesso }
 *       401: { description: Não autorizado }
 *       403: { description: Sem permissão }
 *       500: { description: Erro interno }
 */
router.get("/cotacoes", adminNewsController.listCotacoes);

/**
 * @openapi
 * /api/admin/news/cotacoes:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Cria uma cotação
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsCotacaoInput'
 *     responses:
 *       201: { description: Criado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.post("/cotacoes", adminNewsController.createCotacao);

/**
 * @openapi
 * /api/admin/news/cotacoes/{id}:
 *   put:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Atualiza uma cotação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do registro."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsCotacaoInput'
 *     responses:
 *       200: { description: Atualizado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.put("/cotacoes/:id", adminNewsController.updateCotacao);

/**
 * @openapi
 * /api/admin/news/cotacoes/{id}:
 *   delete:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Remove uma cotação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do registro."
 *     responses:
 *       200: { description: Removido com sucesso }
 *       400: { description: ID inválido }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.delete("/cotacoes/:id", adminNewsController.deleteCotacao);

/* =========================
 * POSTS
 * ========================= */

/**
 * @openapi
 * /api/admin/news/posts:
 *   get:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Lista posts (admin) com filtros
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, example: "draft" }
 *         description: "Filtra por status: draft, published, archived."
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: "Busca textual (título/slug)."
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: "Quantidade máxima."
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: "Offset para paginação."
 *     responses:
 *       200: { description: Lista retornada com sucesso }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.get("/posts", adminNewsController.listPosts);

/**
 * @openapi
 * /api/admin/news/posts:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Cria um post
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsPostInput'
 *     responses:
 *       201: { description: Criado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.post("/posts", adminNewsController.createPost);

/**
 * @openapi
 * /api/admin/news/posts/{id}:
 *   put:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Atualiza um post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do post."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewsPostInput'
 *     responses:
 *       200: { description: Atualizado com sucesso }
 *       400: { description: Validação falhou }
 *       409: { description: Duplicado (slug já existe) }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.put("/posts/:id", adminNewsController.updatePost);

/**
 * @openapi
 * /api/admin/news/posts/{id}:
 *   delete:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Remove um post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do post."
 *     responses:
 *       200: { description: Removido com sucesso }
 *       400: { description: ID inválido }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.delete("/posts/:id", adminNewsController.deletePost);

/**
 * @openapi
 * /api/admin/news/posts/{id}/publish:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Publica um post (muda status para published)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do post."
 *     responses:
 *       200: { description: Publicado com sucesso }
 *       400: { description: ID inválido }
 *       401: { description: Não autorizado }
 *       500: { description: Erro interno }
 */
router.post("/posts/:id/publish", adminNewsController.publishPost);

module.exports = router;
