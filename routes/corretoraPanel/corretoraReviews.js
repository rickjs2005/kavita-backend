// routes/corretoraPanel/corretoraReviews.js
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { replyReviewSchema } = require("../../schemas/corretoraReviewsSchemas");
const ctrl = require("../../controllers/corretoraPanel/reviewsCorretoraController");

// Listagem e resposta são abertas a qualquer papel com acesso ao painel.
// Reply é textual, não destrutivo; permitir viewer responder em nome da
// corretora seria ruim, mas hoje não há capability específica; se no
// futuro fizer sentido, plugar requireCapability("reviews.reply") aqui.
router.get("/", ctrl.listMine);
router.patch("/:id/reply", validate(replyReviewSchema), ctrl.replyToReview);

module.exports = router;
