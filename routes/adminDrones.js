

// routes/adminDrones.js
"use strict";

const express = require("express");
const router = express.Router();

// ✅ Padrão: verifyAdmin fica no mount em routes/index.js
const dronesAdminController = require("../controllers/dronesAdminController");

const mediaService = require("../services/mediaService");
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

router.get("/page", dronesAdminController.getPage);

router.put(
  "/page",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  dronesAdminController.upsertPage
);

// mantém POST legado também
router.post(
  "/page",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  dronesAdminController.upsertPage
);

router.delete("/page", dronesAdminController.resetPageToDefault);

// alias compatível
router.get("/page-settings", dronesAdminController.getPage);

router.put(
  "/page-settings",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  dronesAdminController.upsertPage
);

router.post(
  "/page-settings",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  dronesAdminController.upsertPage
);

/* =========================================================
 * CONFIG (landing-only)
 * ========================================================= */

router.get("/config", dronesAdminController.getLandingConfig);

router.put(
  "/config",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImageFallback", maxCount: 1 },
  ]),
  dronesAdminController.upsertLandingConfig
);

/* =========================================================
 * MODELS (drone_models) + model aggregate + model info
 * ========================================================= */

router.get("/models", dronesAdminController.listModels);
router.post("/models", jsonParser, dronesAdminController.createModel);

router.get("/models/:modelKey", dronesAdminController.getModelAggregate);
router.put("/models/:modelKey", jsonParser, dronesAdminController.upsertModelInfo);
router.delete("/models/:modelKey", dronesAdminController.deleteModel);

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

router.get("/models/:modelKey/gallery", dronesAdminController.listModelGallery);

router.post(
  "/models/:modelKey/gallery",
  upload.single("media"),
  dronesAdminController.createModelGalleryItem
);

router.put(
  "/models/:modelKey/gallery/:id",
  upload.single("media"),
  dronesAdminController.updateModelGalleryItem
);

router.put(
  "/models/:modelKey/media-selection",
  jsonParser,
  dronesAdminController.setModelMediaSelection
);

router.delete(
  "/models/:modelKey/gallery/:id",
  dronesAdminController.deleteModelGalleryItem
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

router.get("/galeria", dronesAdminController.listGallery);

router.post(
  "/galeria",
  upload.single("media"),
  dronesAdminController.createGalleryItem
);

router.put(
  "/galeria/:id",
  upload.single("media"),
  dronesAdminController.updateGalleryItem
);

router.delete("/galeria/:id", dronesAdminController.deleteGalleryItem);

/* =========================================================
 * REPRESENTANTES (CRUD)
 * ========================================================= */

router.get("/representantes", dronesAdminController.listRepresentatives);
router.post("/representantes", jsonParser, dronesAdminController.createRepresentative);
router.put("/representantes/:id", jsonParser, dronesAdminController.updateRepresentative);
router.delete("/representantes/:id", dronesAdminController.deleteRepresentative);

/* =========================================================
 * COMENTÁRIOS (moderação)
 * ========================================================= */

router.get("/comentarios", dronesAdminController.listComments);
router.put("/comentarios/:id/aprovar", dronesAdminController.approveComment);
router.put("/comentarios/:id/reprovar", dronesAdminController.rejectComment);
router.delete("/comentarios/:id", dronesAdminController.deleteComment);

module.exports = router;
