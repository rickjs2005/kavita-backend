"use strict";
// controllers/supportConfigController.js
//
// Admin: leitura e atualizacao das configuracoes da central de atendimento.
// Public: leitura da config publica para a pagina /contato.
//
// Contrato admin:
//   GET  /api/admin/support-config   → { ok: true, data: { ... } }
//   PUT  /api/admin/support-config   → { ok: true, data: { ... }, message }
//
// Contrato publico:
//   GET  /api/public/support-config  → { ok: true, data: { ... } }

const svc = require("../services/supportConfigService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

const getConfig = async (_req, res, next) => {
  try {
    const config = await svc.getConfig();
    return response.ok(res, config);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao carregar configuracoes.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const config = await svc.updateConfig(req.body);
    return response.ok(res, config, "Configuracoes atualizadas.");
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao salvar configuracoes.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const getPublicConfig = async (_req, res, next) => {
  try {
    const config = await svc.getPublicConfig();
    return response.ok(res, config);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao carregar configuracoes publicas.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { getConfig, updateConfig, getPublicConfig };
