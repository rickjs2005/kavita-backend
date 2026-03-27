

// routes/adminDrones.js
"use strict";

const express = require("express");
const router = express.Router();

// ✅ Padrão: verifyAdmin fica no mount em routes/index.js
const pageCtrl          = require("../../controllers/drones/pageController");
const modelsCtrl        = require("../../controllers/drones/modelsController");
const galleryCtrl       = require("../../controllers/drones/galleryController");
const representativesCtrl = require("../../controllers/drones/representativesController");
const commentsCtrl      = require("../../controllers/drones/commentsController");

const mediaService = require("../../services/mediaService");
const upload = mediaService.upload;

const jsonParser = express.json({ limit: "2mb" });

/**
 * @openapi
 * tags:
 *   - name: Admin Drones
 *     description: Gestão do módulo Kavita Drones (Admin)
 *
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/* =========================================================
 * PAGE (LEGADO) /page + alias /page-settings
 * ========================================================= */

router.get("/page", pageCtrl.getPage);

router.put(
  "/page",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  pageCtrl.upsertPage
);

// mantém POST legado também
router.post(
  "/page",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  pageCtrl.upsertPage
);

router.delete("/page", pageCtrl.resetPageToDefault);

// alias compatível
router.get("/page-settings", pageCtrl.getPage);

router.put(
  "/page-settings",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  pageCtrl.upsertPage
);

router.post(
  "/page-settings",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  pageCtrl.upsertPage
);

/* =========================================================
 * CONFIG (landing-only)
 * ========================================================= */

router.get("/config", pageCtrl.getLandingConfig);

router.put(
  "/config",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  pageCtrl.upsertLandingConfig
);

/* =========================================================
 * MODELS (drone_models) + model aggregate + model info
 * ========================================================= */

router.get("/models", modelsCtrl.listModels);
router.post("/models", jsonParser, modelsCtrl.createModel);

router.get("/models/:modelKey", modelsCtrl.getModelAggregate);
router.put("/models/:modelKey", jsonParser, modelsCtrl.upsertModelInfo);
router.delete("/models/:modelKey", modelsCtrl.deleteModel);

/* =========================================================
 * MODEL GALLERY: /models/:modelKey/gallery
 * ========================================================= */

/**
 * @openapi
 * /api/admin/drones/models/{modelKey}/gallery/{id}:
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Atualiza item de galeria do modelo (multipart: opcionalmente troca a mídia)"
 */

router.get("/models/:modelKey/gallery", galleryCtrl.listModelGallery);

router.post(
  "/models/:modelKey/gallery",
  upload.single("media"),
  galleryCtrl.createModelGalleryItem
);

router.put(
  "/models/:modelKey/gallery/:id",
  upload.single("media"),
  galleryCtrl.updateModelGalleryItem
);

router.put(
  "/models/:modelKey/media-selection",
  jsonParser,
  modelsCtrl.setModelMediaSelection
);

router.delete(
  "/models/:modelKey/gallery/:id",
  galleryCtrl.deleteModelGalleryItem
);

/* =========================================================
 * LEGADO: /galeria (alias compatível)
 * ========================================================= */

/**
 * @openapi
 * /api/admin/drones/galeria/{id}:
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Atualiza item de galeria (legado) (multipart: opcionalmente troca a mídia)"
 */

router.get("/galeria", galleryCtrl.listGallery);

router.post(
  "/galeria",
  upload.single("media"),
  galleryCtrl.createGalleryItem
);

router.put(
  "/galeria/:id",
  upload.single("media"),
  galleryCtrl.updateGalleryItem
);

router.delete("/galeria/:id", galleryCtrl.deleteGalleryItem);

/* =========================================================
 * REPRESENTANTES (CRUD)
 * ========================================================= */

router.get("/representantes", representativesCtrl.listRepresentatives);
router.post("/representantes", jsonParser, representativesCtrl.createRepresentative);
router.put("/representantes/:id", jsonParser, representativesCtrl.updateRepresentative);
router.delete("/representantes/:id", representativesCtrl.deleteRepresentative);

/* =========================================================
 * COMENTÁRIOS (moderação)
 * ========================================================= */

router.get("/comentarios", commentsCtrl.listComments);
router.put("/comentarios/:id/aprovar", commentsCtrl.approveComment);
router.put("/comentarios/:id/reprovar", commentsCtrl.rejectComment);
router.delete("/comentarios/:id", commentsCtrl.deleteComment);

module.exports = router;
