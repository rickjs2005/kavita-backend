// routes/corretoraPanel/corretoraNotifications.js
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/corretoraPanel/notificationsCorretoraController");

// Todos os endpoints livres para qualquer role autenticado — não há
// capability específica porque notificações são pessoais do user.
router.get("/", ctrl.list);
router.get("/unread-count", ctrl.getUnreadCount);
router.post("/:id/read", ctrl.markAsRead);
router.post("/read-all", ctrl.markAllAsRead);

module.exports = router;
