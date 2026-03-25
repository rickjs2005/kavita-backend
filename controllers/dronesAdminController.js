"use strict";

/**
 * Barrel re-export — preserves backward compatibility for all existing importers.
 * Business logic lives in controllers/drones/*.js
 */

const pageController = require("./drones/pageController");
const modelsController = require("./drones/modelsController");
const galleryController = require("./drones/galleryController");
const representativesController = require("./drones/representativesController");
const commentsController = require("./drones/commentsController");

module.exports = {
  // page / landing config
  getPage: pageController.getPage,
  upsertPage: pageController.upsertPage,
  resetPageToDefault: pageController.resetPageToDefault,
  getLandingConfig: pageController.getLandingConfig,
  upsertLandingConfig: pageController.upsertLandingConfig,

  // drone models CRUD
  listModels: modelsController.listModels,
  createModel: modelsController.createModel,
  deleteModel: modelsController.deleteModel,
  getModelAggregate: modelsController.getModelAggregate,
  upsertModelInfo: modelsController.upsertModelInfo,
  setModelMediaSelection: modelsController.setModelMediaSelection,

  // model-scoped gallery
  listModelGallery: galleryController.listModelGallery,
  createModelGalleryItem: galleryController.createModelGalleryItem,
  updateModelGalleryItem: galleryController.updateModelGalleryItem,
  deleteModelGalleryItem: galleryController.deleteModelGalleryItem,

  // global gallery
  listGallery: galleryController.listGallery,
  createGalleryItem: galleryController.createGalleryItem,
  updateGalleryItem: galleryController.updateGalleryItem,
  deleteGalleryItem: galleryController.deleteGalleryItem,

  // representatives
  listRepresentatives: representativesController.listRepresentatives,
  createRepresentative: representativesController.createRepresentative,
  updateRepresentative: representativesController.updateRepresentative,
  deleteRepresentative: representativesController.deleteRepresentative,

  // comments
  listComments: commentsController.listComments,
  approveComment: commentsController.approveComment,
  rejectComment: commentsController.rejectComment,
  deleteComment: commentsController.deleteComment,
};
