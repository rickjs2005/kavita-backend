"use strict";
// controllers/relatoriosController.js
//
// Admin reports — pure read-only, no service layer needed.
// Consumer: routes/admin/adminRelatorios.js

const { response } = require("../lib");
const repo = require("../repositories/relatoriosRepository");

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/vendas
// ---------------------------------------------------------------------------

const getVendas = async (_req, res, next) => {
  try {
    const rows = await repo.getVendasPorDia();
    response.ok(res, {
      labels: rows.map((r) => r.dia),
      values: rows.map((r) => Number(r.total)),
      rows,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/produtos-mais-vendidos
// ---------------------------------------------------------------------------

const getProdutosMaisVendidos = async (_req, res, next) => {
  try {
    const rows = await repo.getProdutosMaisVendidos();
    response.ok(res, {
      labels: rows.map((r) => r.name),
      values: rows.map((r) => Number(r.vendidos)),
      rows,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/clientes-top
// ---------------------------------------------------------------------------

const getClientesTop = async (_req, res, next) => {
  try {
    const rows = await repo.getClientesTop();
    response.ok(res, {
      labels: rows.map((r) => r.nome),
      values: rows.map((r) => Number(r.total_gasto)),
      rows,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/estoque
// ---------------------------------------------------------------------------

const getEstoque = async (_req, res, next) => {
  try {
    const data = await repo.getEstoque();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/estoque-baixo
// ---------------------------------------------------------------------------

const getEstoqueBaixo = async (_req, res, next) => {
  try {
    const data = await repo.getEstoqueBaixo();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/servicos
// ---------------------------------------------------------------------------

const getServicos = async (_req, res, next) => {
  try {
    const data = await repo.getServicosPorEspecialidade();
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/relatorios/servicos-ranking
// ---------------------------------------------------------------------------

const getServicosRanking = async (_req, res, next) => {
  try {
    const rows = await repo.getServicosRanking();
    response.ok(res, {
      labels: rows.map((r) => r.nome),
      values: rows.map((r) => Number(r.total_servicos || 0)),
      rows,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getVendas,
  getProdutosMaisVendidos,
  getClientesTop,
  getEstoque,
  getEstoqueBaixo,
  getServicos,
  getServicosRanking,
};
