"use strict";
// controllers/logsController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/logsRepository");

const listLogs = async (req, res, next) => {
  try {
    const rawLimit = Number(req.query.limit) || 20;
    const limit = Math.min(rawLimit, 100);
    const offset = Number(req.query.offset) || 0;

    const { acao, entidade, admin_id, admin_email, data_inicio, data_fim } = req.query;

    const where = [];
    const params = [];

    if (acao)         { where.push("l.acao = ?");      params.push(acao); }
    if (entidade)     { where.push("l.entidade = ?");  params.push(entidade); }
    if (admin_id)     { where.push("l.admin_id = ?");  params.push(Number(admin_id)); }
    if (admin_email)  { where.push("a.email LIKE ?");  params.push(`%${admin_email}%`); }
    if (data_inicio)  { where.push("l.data >= ?");     params.push(data_inicio); }
    if (data_fim)     { where.push("l.data <= ?");     params.push(data_fim); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await repo.findAll({ where: whereSql, params, limit, offset });
    return response.ok(res, rows);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar logs.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const getLogById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

    const row = await repo.findById(id);
    if (!row) return next(new AppError("Log não encontrado.", ERROR_CODES.NOT_FOUND, 404));

    return response.ok(res, row);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar log.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { listLogs, getLogById };
