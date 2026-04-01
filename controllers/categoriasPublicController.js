"use strict";
// controllers/categoriasPublicController.js
//
// Thin HTTP adapter para o endpoint público de categorias.
// Sem SQL, sem lógica de negócio — delega ao repository e responde via lib/response.js.
//
// Contrato de resposta (Phase 1 — 2026-03):
//   GET / → { ok: true, data: [{ id, name, slug, is_active, sort_order, total_products }] }

const repo = require("../repositories/categoriasRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

const listCategorias = async (_req, res, next) => {
  try {
    const categorias = await repo.findActiveCategories();
    return response.ok(res, categorias);
  } catch (err) {
    console.error("[GET /api/public/categorias] Erro:", err);
    return next(new AppError("Erro ao buscar categorias.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { listCategorias };
