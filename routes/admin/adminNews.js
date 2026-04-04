const express = require("express");
const router = express.Router();
const newsAdmin = require("../../controllers/adminNewsController");
const adminNewsUploadRoutes = require("./adminNewsUpload");
const { validate } = require("../../middleware/validate");
const { createClimaBodySchema, updateClimaBodySchema } = require("../../schemas/climaSchemas");
const { createCotacaoBodySchema, updateCotacaoBodySchema } = require("../../schemas/cotacoesSchemas");
const { PostIdParamSchema, CreatePostSchema, UpdatePostSchema } = require("../../schemas/newsSchemas");

router.use("/upload", adminNewsUploadRoutes);

// CLIMA
router.get("/clima", newsAdmin.listClima);
router.get("/clima/stations", newsAdmin.suggestClimaStations);
router.post("/clima", validate(createClimaBodySchema), newsAdmin.createClima);
router.put("/clima/:id", validate(updateClimaBodySchema), newsAdmin.updateClima);
router.delete("/clima/:id", newsAdmin.deleteClima);
router.post("/clima/sync-all", newsAdmin.syncClimaAll);
router.post("/clima/:id/sync", newsAdmin.syncClima);

// COTAÇÕES
router.get("/cotacoes", newsAdmin.listCotacoes);
router.get("/cotacoes/meta", newsAdmin.getCotacoesMeta);
router.post("/cotacoes", validate(createCotacaoBodySchema), newsAdmin.createCotacao);
router.put("/cotacoes/:id", validate(updateCotacaoBodySchema), newsAdmin.updateCotacao);
router.delete("/cotacoes/:id", newsAdmin.deleteCotacao);
router.post("/cotacoes/:id/sync", newsAdmin.syncCotacao);
router.post("/cotacoes/sync-all", newsAdmin.syncCotacoesAll);

// POSTS
router.get("/posts", newsAdmin.listPosts);
router.post("/posts", validate(CreatePostSchema), newsAdmin.createPost);
router.put("/posts/:id", validate(PostIdParamSchema, "params"), validate(UpdatePostSchema), newsAdmin.updatePost);
router.delete("/posts/:id", validate(PostIdParamSchema, "params"), newsAdmin.deletePost);

module.exports = router;
