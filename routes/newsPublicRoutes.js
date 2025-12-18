// routes/newsPublicRoutes.js
const express = require("express");
const router = express.Router();

const newsPublicController = require("../controllers/newsPublicController");

/**
 * @openapi
 * tags:
 *   - name: Kavita News (Public)
 *     description: Endpoints públicos do Kavita News (site consome sem login)
 */

/**
 * @openapi
 * /api/news/overview:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Overview para homepage (clima + cotações + posts)
 *     parameters:
 *       - in: query
 *         name: posts_limit
 *         schema:
 *           type: integer
 *           default: 6
 *     responses:
 *       200:
 *         description: Overview carregado
 *       500:
 *         description: Erro interno
 */
router.get("/overview", newsPublicController.overview);

/**
 * @openapi
 * /api/news/clima:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Lista cidades de clima ativas
 *     responses:
 *       200:
 *         description: Lista de clima
 *       500:
 *         description: Erro interno
 */
router.get("/clima", newsPublicController.listClima);

/**
 * @openapi
 * /api/news/clima/{slug}:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Busca clima por cidade (slug)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: "Slug da cidade (ex: manhuacu, santana-do-manhuacu)."
 *     responses:
 *       200:
 *         description: Clima encontrado
 *       400:
 *         description: Parâmetro inválido
 *       404:
 *         description: Cidade não encontrada
 *       500:
 *         description: Erro interno
 */
router.get("/clima/:slug", newsPublicController.getClima);

/**
 * @openapi
 * /api/news/cotacoes:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Lista cotações ativas (opcional por group_key)
 *     parameters:
 *       - in: query
 *         name: group_key
 *         schema:
 *           type: string
 *         description: "Filtro por group_key (ex: graos, boi, moedas)."
 *     responses:
 *       200:
 *         description: Lista de cotações
 *       500:
 *         description: Erro interno
 */
router.get("/cotacoes", newsPublicController.listCotacoes);

/**
 * @openapi
 * /api/news/cotacoes/{slug}:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Busca cotação por slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: "Slug da cotação (ex: cafe-arabica, boi-gordo, milho)."
 *     responses:
 *       200:
 *         description: Cotação encontrada
 *       400:
 *         description: Parâmetro inválido
 *       404:
 *         description: Cotação não encontrada
 *       500:
 *         description: Erro interno
 */
router.get("/cotacoes/:slug", newsPublicController.getCotacao);

/**
 * @openapi
 * /api/news/posts:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Lista posts publicados (paginado)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: "Quantidade máxima retornada (ex: 10)."
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: "Deslocamento para paginação (ex: 0, 10, 20...)."
 *     responses:
 *       200:
 *         description: Lista de posts publicados
 *       400:
 *         description: Parâmetros inválidos
 *       500:
 *         description: Erro interno
 */
router.get("/posts", newsPublicController.listPosts);

/**
 * @openapi
 * /api/news/posts/{slug}:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Busca um post publicado por slug (incrementa views)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: "Slug do post."
 *     responses:
 *       200:
 *         description: Post publicado encontrado
 *       404:
 *         description: Post não encontrado (ou não publicado)
 *       500:
 *         description: Erro interno
 */
router.get("/posts/:slug", newsPublicController.getPost);

module.exports = router;
