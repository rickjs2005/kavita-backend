"use strict";

/**
 * Barrel re-export — preserves backward compatibility for all existing importers.
 * Business logic lives in services/drones/*.js
 */

const helpers = require("./drones/helpers");
const pageService = require("./drones/pageService");
const modelsService = require("./drones/modelsService");
const galleryService = require("./drones/galleryService");
const representativesService = require("./drones/representativesService");
const commentsService = require("./drones/commentsService");

module.exports = {
  // helpers (used by controllers)
  clampInt: helpers.clampInt,
  sanitizeText: helpers.sanitizeText,
  safeParseJson: helpers.safeParseJson,
  hasColumn: helpers.hasColumn,
  getTableRowCount: helpers.getTableRowCount,

  // page settings
  getPageSettings: pageService.getPageSettings,
  upsertPageSettings: pageService.upsertPageSettings,

  // models json (specs/features/benefits per model)
  getModelsJsonFromPage: modelsService.getModelsJsonFromPage,
  getModelInfo: modelsService.getModelInfo,
  upsertModelInfo: modelsService.upsertModelInfo,

  // media selections (HERO/CARD)
  getModelSelections: modelsService.getModelSelections,
  upsertModelSelection: modelsService.upsertModelSelection,
  getSelectionsMapForModels: modelsService.getSelectionsMapForModels,
  setDroneModelSelection: modelsService.setDroneModelSelection,

  // gallery
  listGalleryPublic: galleryService.listGalleryPublic,
  listGalleryAdmin: galleryService.listGalleryAdmin,
  createGalleryItem: galleryService.createGalleryItem,
  updateGalleryItem: galleryService.updateGalleryItem,
  deleteGalleryItem: galleryService.deleteGalleryItem,
  getGalleryItemsByIds: galleryService.getGalleryItemsByIds,

  // representatives
  listRepresentativesPublic: representativesService.listRepresentativesPublic,
  listRepresentativesAdmin: representativesService.listRepresentativesAdmin,
  createRepresentative: representativesService.createRepresentative,
  updateRepresentative: representativesService.updateRepresentative,
  deleteRepresentative: representativesService.deleteRepresentative,

  // comments
  listApprovedComments: commentsService.listApprovedComments,
  listCommentsAdmin: commentsService.listCommentsAdmin,
  getCommentById: commentsService.getCommentById,
  createComment: commentsService.createComment,
  deleteComment: commentsService.deleteComment,
  setCommentApproval: commentsService.setCommentApproval,
  setCommentStatus: commentsService.setCommentStatus,

  // drone models CRUD
  listDroneModels: modelsService.listDroneModels,
  getDroneModelByKey: modelsService.getDroneModelByKey,
  createDroneModel: modelsService.createDroneModel,
  updateDroneModel: modelsService.updateDroneModel,
  deleteDroneModel: modelsService.deleteDroneModel,
};
