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
 *     ApiOk:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *     ApiError:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: false
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Erro de validação.
 *         details:
 *           type: object
 *
 *     NewsClimaInput:
 *       type: object
 *       properties:
 *         city_name:
 *           type: string
 *           example: Uberlândia
 *         slug:
 *           type: string
 *           example: uberlandia
 *         uf:
 *           type: string
 *           example: MG
 *         ibge_id:
 *           type: integer
 *           example: 3170206
 *         station_code:
 *           type: string
 *           example: A827
 *         station_name:
 *           type: string
 *           example: UBERLANDIA
 *         station_uf:
 *           type: string
 *           example: MG
 *         station_lat:
 *           type: number
 *           example: -18.92
 *         station_lon:
 *           type: number
 *           example: -48.26
 *         station_distance:
 *           type: number
 *           example: 12.35
 *         ibge_source:
 *           type: string
 *           example: IBGE
 *         station_source:
 *           type: string
 *           example: INMET
 *         last_sync_observed_at:
 *           type: string
 *           example: "2025-12-16 10:30:00"
 *         last_sync_forecast_at:
 *           type: string
 *           example: "2025-12-16 10:30:00"
 *         mm_24h:
 *           type: number
 *           example: 12.3
 *         mm_7d:
 *           type: number
 *           example: 55.7
 *         source:
 *           type: string
 *           example: INMET
 *         last_update_at:
 *           type: string
 *           example: "2025-12-16 10:30:00"
 *         ativo:
 *           type: integer
 *           example: 1
 *
 *     NewsCotacaoInput:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: Café Arábica
 *         slug:
 *           type: string
 *           example: cafe-arabica
 *         type:
 *           type: string
 *           example: cafe
 *         price:
 *           type: number
 *           example: 1234.56
 *         unit:
 *           type: string
 *           example: R$/sc 60kg
 *         variation_day:
 *           type: number
 *           example: -12.4
 *         market:
 *           type: string
 *           example: CEPEA
 *         source:
 *           type: string
 *           example: CEPEA
 *         last_update_at:
 *           type: string
 *           example: "2025-12-16 10:30:00"
 *         ativo:
 *           type: integer
 *           example: 1
 *
 *     NewsPostInput:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: Preço do café hoje em MG
 *         slug:
 *           type: string
 *           example: preco-do-cafe-hoje-em-mg
 *         excerpt:
 *           type: string
 *           example: Resumo curto do post.
 *         content:
 *           type: string
 *           example: Conteúdo completo.
 *         cover_image_url:
 *           type: string
 *           example: https://example.com/capa.jpg
 *         category:
 *           type: string
 *           example: cafe
 *         tags:
 *           type: string
 *           example: cafe,mg,preco
 *         status:
 *           type: string
 *           example: draft
 *         published_at:
 *           type: string
 *           example: "2025-12-16 10:30:00"
 *         author_admin_id:
 *           type: integer
 *           example: 1
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
 *       200:
 *         description: Lista retornada com sucesso
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
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
 *             $ref: "#/components/schemas/NewsClimaInput"
 *     responses:
 *       201:
 *         description: Criado com sucesso
 *       400:
 *         description: Validação falhou
 *       409:
 *         description: Duplicado (slug já existe)
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
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
 *         schema:
 *           type: integer
 *         description: ID do registro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/NewsClimaInput"
 *     responses:
 *       200:
 *         description: Atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       409:
 *         description: Duplicado (slug já existe)
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
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
 *         schema:
 *           type: integer
 *         description: ID do registro
 *     responses:
 *       200:
 *         description: Removido com sucesso
 *       400:
 *         description: ID inválido
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.delete("/clima/:id", adminNewsController.deleteClima);

/**
 * @openapi
 * /api/admin/news/clima/{id}/sync:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Sincroniza chuva (mm) para uma cidade (usa station_code / ibge_id)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do registro em news_clima
 *     responses:
 *       200:
 *         description: Sincronizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Registro não encontrado
 *       502:
 *         description: Falha no provedor
 *       500:
 *         description: Erro interno
 */
router.post("/clima/:id/sync", adminNewsController.syncClima);

/* =========================
 * COTAÇÕES
 * ========================= */

router.get("/cotacoes", adminNewsController.listCotacoes);
router.post("/cotacoes", adminNewsController.createCotacao);
router.put("/cotacoes/:id", adminNewsController.updateCotacao);
router.delete("/cotacoes/:id", adminNewsController.deleteCotacao);

/* =========================
 * POSTS
 * ========================= */

router.get("/posts", adminNewsController.listPosts);
router.post("/posts", adminNewsController.createPost);
router.put("/posts/:id", adminNewsController.updatePost);
router.delete("/posts/:id", adminNewsController.deletePost);
router.post("/posts/:id/publish", adminNewsController.publishPost);

module.exports = router;
