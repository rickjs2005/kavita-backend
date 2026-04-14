"use strict";

// controllers/admin/adminCorretorasMetricsController.js

const { response } = require("../../lib");
const service = require("../../services/corretorasMetricsService");

async function getMetrics(req, res, next) {
  try {
    const range = String(req.query.range || "30d");
    const data = await service.getDashboard(range);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMetrics };
