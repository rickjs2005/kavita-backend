"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/corretoraPanel/corretoraSupportController");
const { validate } = require("../../middleware/validate");
const schemas = require("../../schemas/corretoraSupportSchemas");

router.get("/messages", ctrl.listMyMessages);
router.post(
  "/messages",
  validate(schemas.sendMessageBodySchema),
  ctrl.sendMessage,
);

module.exports = router;
