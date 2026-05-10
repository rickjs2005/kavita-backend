// routes/newsPublicRoutes.js
const express = require("express");
const router = express.Router();

const newsPublicController = require("../../controllers/newsPublicController");
const newsWhatsappController = require("../../controllers/newsWhatsappController");
const { validate } = require("../../middleware/validate");
const { newsWhatsappLimiter } = require("../../middleware/absoluteRateLimit");
const {
  subscribeBodySchema,
  confirmBodySchema,
  unsubscribeBodySchema,
} = require("../../schemas/newsWhatsappSchemas");

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
 * /api/news/cotacoes/history-batch:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Histórico em lote (até 12 cotações)
 *     description: |
 *       Retorna o histórico de várias cotações em uma única requisição.
 *       Usado pelo painel "Cotações em tempo real" da home /news para
 *       desenhar sparklines sem precisar fazer N requisições.
 *     parameters:
 *       - in: query
 *         name: slugs
 *         required: true
 *         schema:
 *           type: string
 *         description: "Slugs separados por vírgula (ex: cafe-arabica,soja,milho). Máx 12."
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 24
 *         description: "Pontos por slug (1-50). Default 24."
 *     responses:
 *       200:
 *         description: "Mapa { slug: [pontos...] }"
 *       400:
 *         description: Parâmetros inválidos
 *       500:
 *         description: Erro interno
 */
router.get("/cotacoes/history-batch", newsPublicController.getCotacoesHistoryBatch);

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
 * /api/news/cotacoes/{slug}/history:
 *   get:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Histórico de atualizações de uma cotação
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: "Quantidade de registros (máx 50)."
 *     responses:
 *       200:
 *         description: Histórico retornado
 *       404:
 *         description: Cotação não encontrada
 */
router.get("/cotacoes/:slug/history", newsPublicController.getCotacaoHistory);

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

/**
 * @openapi
 * /api/news/whatsapp-subscribe:
 *   post:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Inscreve um número no canal WhatsApp do Kavita News
 *     description: |
 *       Idempotente — reinscrição do mesmo número retorna 200 com `created=false`.
 *       Rate-limit: 5 req/min/IP (env RATE_LIMIT_NEWS_WHATSAPP_PER_MINUTE).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:  { type: string, example: "(31) 99999-0000" }
 *               source: { type: string, example: "home_news" }
 *     responses:
 *       200: { description: "Inscrição registrada (ou já existia)" }
 *       400: { description: "Telefone inválido" }
 *       429: { description: "Rate limit excedido" }
 *       500: { description: "Erro interno" }
 */
router.post(
  "/whatsapp-subscribe",
  newsWhatsappLimiter,
  validate(subscribeBodySchema),
  newsWhatsappController.subscribe,
);

/**
 * @openapi
 * /api/news/whatsapp-confirm:
 *   post:
 *     tags: [Kavita News (Public)]
 *     summary: Confirma opt-in via token retornado no subscribe
 *     description: |
 *       Promove pending → active. Idempotente. Rate-limit 5/min/IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: "Confirmado (ou ja estava active)" }
 *       404: { description: "Token nao encontrado" }
 *       409: { description: "Subscriber em opt-out — exige reativacao manual" }
 *       429: { description: "Rate limit excedido" }
 */
router.post(
  "/whatsapp-confirm",
  newsWhatsappLimiter,
  validate(confirmBodySchema),
  newsWhatsappController.confirm,
);

/**
 * @openapi
 * /api/news/whatsapp-unsubscribe:
 *   post:
 *     tags: [Kavita News (Public)]
 *     summary: Opt-out via token
 *     description: |
 *       Marca como unsubscribed. Idempotente. Rate-limit 5/min/IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: "Opt-out registrado" }
 *       404: { description: "Token nao encontrado" }
 *       429: { description: "Rate limit excedido" }
 */
router.post(
  "/whatsapp-unsubscribe",
  newsWhatsappLimiter,
  validate(unsubscribeBodySchema),
  newsWhatsappController.unsubscribe,
);

module.exports = router;
