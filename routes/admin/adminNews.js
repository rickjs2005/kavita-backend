const express = require("express");
const router = express.Router();
const newsAdmin = require("../../controllers/adminNewsController");
const newsWhatsappController = require("../../controllers/newsWhatsappController");
const adminNewsUploadRoutes = require("./adminNewsUpload");
const { validate } = require("../../middleware/validate");
const { createClimaBodySchema, updateClimaBodySchema } = require("../../schemas/climaSchemas");
const { createCotacaoBodySchema, updateCotacaoBodySchema } = require("../../schemas/cotacoesSchemas");
const { PostIdParamSchema, CreatePostSchema, UpdatePostSchema } = require("../../schemas/newsSchemas");
const {
  listSubscribersQuerySchema,
  adminSubscriberIdParamSchema,
  adminUpdateStatusBodySchema,
} = require("../../schemas/newsWhatsappSchemas");

router.use("/upload", adminNewsUploadRoutes);

// CLIMA
router.get("/clima", newsAdmin.listClima);
router.get("/clima/config", newsAdmin.getSyncConfig);
router.put("/clima/config", newsAdmin.updateSyncConfig);
router.get("/clima/stations", newsAdmin.suggestClimaStations);
router.post("/clima", validate(createClimaBodySchema), newsAdmin.createClima);
router.put("/clima/:id", validate(updateClimaBodySchema), newsAdmin.updateClima);
router.delete("/clima/:id", newsAdmin.deleteClima);
router.post("/clima/sync-all", newsAdmin.syncClimaAll);
router.post("/clima/:id/sync", newsAdmin.syncClima);

// COTAÇÕES
router.get("/cotacoes", newsAdmin.listCotacoes);
router.get("/cotacoes/config", newsAdmin.getCotacoesSyncConfig);
router.put("/cotacoes/config", newsAdmin.updateCotacoesSyncConfig);
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

// WHATSAPP SUBSCRIBERS — leitura para o admin acompanhar a lista de espera
// do canal "Central no WhatsApp" (POST público fica em routes/public/publicNews.js).
router.get(
  "/whatsapp-subscribers",
  validate(listSubscribersQuerySchema, "query"),
  newsWhatsappController.listSubscribers,
);

// PATCH manual de status — usado quando o admin recebe a mensagem de opt-in
// pelo proprio WhatsApp e marca active na mao. Tambem cobre reativacao
// pos-opt-out (LGPD: so via admin, nao por link publico).
router.patch(
  "/whatsapp-subscribers/:id/status",
  validate(adminSubscriberIdParamSchema, "params"),
  validate(adminUpdateStatusBodySchema),
  newsWhatsappController.adminUpdateStatus,
);

module.exports = router;
