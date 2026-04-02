"use strict";
// controllers/statsController.js
//
// Admin dashboard stats. No service layer needed — pure read-only aggregation.
// Consumer: routes/admin/adminStats.js

const { response } = require("../lib");
const statsRepo = require("../repositories/statsRepository");

// ---------------------------------------------------------------------------
// GET /api/admin/stats/resumo
// ---------------------------------------------------------------------------

const getResumo = async (_req, res, next) => {
  try {
    const data = await statsRepo.getDashboardSummary();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/stats/vendas?range=7
// ---------------------------------------------------------------------------

const getVendas = async (req, res, next) => {
  try {
    const { range } = req.query;
    const rows = await statsRepo.getSalesSeries(range);

    // Fill gaps — ensure every day in range has a data point
    const map = new Map();
    for (const r of rows) {
      const key =
        r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia);
      map.set(key, Number(r.total || 0));
    }

    const today = new Date();
    const points = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({ date: key, total: map.get(key) || 0 });
    }

    response.ok(res, { rangeDays: range, points });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/stats/produtos-mais-vendidos?limit=5
// ---------------------------------------------------------------------------

const getTopProdutos = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const data = await statsRepo.getTopProducts(limit);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/stats/alertas
// ---------------------------------------------------------------------------

const getAlertas = async (_req, res, _next) => {
  // Placeholder — evolve with real rules/queries as needed
  response.ok(res, []);
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getResumo,
  getVendas,
  getTopProdutos,
  getAlertas,
};
