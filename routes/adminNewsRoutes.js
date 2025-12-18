const express = require("express");
const router = express.Router();

const newsAdmin = require("../controllers/adminNewsController");

// CLIMA
router.get("/clima", newsAdmin.listClima);
router.get("/clima/stations", newsAdmin.suggestClimaStations);
router.post("/clima", newsAdmin.createClima);
router.put("/clima/:id", newsAdmin.updateClima);
router.delete("/clima/:id", newsAdmin.deleteClima);
router.post("/clima/:id/sync", newsAdmin.syncClima);

// COTAÇÕES
router.get("/cotacoes", newsAdmin.listCotacoes);
router.post("/cotacoes", newsAdmin.createCotacao);
router.put("/cotacoes/:id", newsAdmin.updateCotacao);
router.delete("/cotacoes/:id", newsAdmin.deleteCotacao);
router.post("/cotacoes/:id/sync", newsAdmin.syncCotacao);
router.post("/cotacoes/sync-all", newsAdmin.syncCotacoesAll);
router.get("/cotacoes/meta", newsAdmin.getCotacoesMeta);

// POSTS (somente se existirem MESMO — evita callback undefined)
if (
  typeof newsAdmin.listPosts === "function" &&
  typeof newsAdmin.createPost === "function" &&
  typeof newsAdmin.updatePost === "function" &&
  typeof newsAdmin.deletePost === "function"
) {
  router.get("/posts", newsAdmin.listPosts);
  router.post("/posts", newsAdmin.createPost);
  router.put("/posts/:id", newsAdmin.updatePost);
  router.delete("/posts/:id", newsAdmin.deletePost);
}

module.exports = router;
