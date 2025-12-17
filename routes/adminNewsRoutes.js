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
 *         city_name: { type: string, example: Uberlândia }
 *         slug: { type: string, example: uberlandia }
 *         uf: { type: string, example: MG }
 *         ibge_id: { type: integer, example: 3170206 }
 *         station_code: { type: string, example: A827 }
 *         station_name: { type: string, example: UBERLANDIA }
 *         station_uf: { type: string, example: MG }
 *         station_lat: { type: number, example: -18.92 }
 *         station_lon: { type: number, example: -48.26 }
 *         station_distance: { type: number, example: 12.35 }
 *         ibge_source: { type: string, example: IBGE }
 *         station_source: { type: string, example: OPEN_METEO_GEOCODING }
 *         last_sync_observed_at: { type: string, example: "2025-12-16 10:30:00" }
 *         last_sync_forecast_at: { type: string, example: "2025-12-16 10:30:00" }
 *         mm_24h: { type: number, example: 12.3 }
 *         mm_7d: { type: number, example: 55.7 }
 *         source: { type: string, example: OPEN_METEO }
 *         last_update_at: { type: string, example: "2025-12-16 10:30:00" }
 *         ativo: { type: integer, example: 1 }
 */

/* =========================
 * CLIMA
 * ========================= */
/**
 * @openapi
 * /api/admin/news/clima/stations:
 *   get:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Sugere coordenadas (lat/lon) por UF + nome (Open-Meteo Geocoding)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: uf
 *         required: true
 *         schema: { type: string, example: "MG" }
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, example: "Manhuaçu" }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, example: 10 }
 *     responses:
 *       200:
 *         description: Lista de locais sugeridos com lat/lon
 *       400:
 *         description: Parâmetros inválidos
 */
router.get("/clima/stations", adminNewsController.suggestClimaStations);

router.get("/clima", adminNewsController.listClima);
router.post("/clima", adminNewsController.createClima);
router.put("/clima/:id", adminNewsController.updateClima);
router.delete("/clima/:id", adminNewsController.deleteClima);

/**
 * @openapi
 * /api/admin/news/clima/{id}/sync:
 *   post:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Sincroniza chuva (mm) para uma cidade (Open-Meteo por lat/lon; geocoding fallback)
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
 *         description: Sincronizado com sucesso (ou meta informando falha do provider)
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Registro não encontrado
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
