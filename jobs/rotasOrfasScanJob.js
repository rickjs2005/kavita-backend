"use strict";

// jobs/rotasOrfasScanJob.js
//
// Cron noturno do Bug 3 (analise de fluxo Pedidos<->Rotas, 2026-04-25).
// Auto-cancela rotas em_rota ha mais de N horas sem update.
//
// Config:
//   ROTAS_ORFAS_SCAN_ENABLED   "true" para ativar (default: false)
//   ROTAS_ORFAS_SCAN_CRON      default "0 1 * * *" (01:00 BRT)
//   ROTAS_ORFAS_HORAS          default 24

const cron = require("node-cron");
const logger = require("../lib/logger");
const rotasOrfasScanService = require("../services/rotasOrfasScanService");

const TAG = "rotas-orfas-scan";

let _task = null;
let _running = false;

const _state = {
  enabled: false,
  cronExpr: null,
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
  lastReport: null,
};

function loadConfig() {
  return {
    enabled:
      String(process.env.ROTAS_ORFAS_SCAN_ENABLED || "").toLowerCase() ===
      "true",
    cronExpr: process.env.ROTAS_ORFAS_SCAN_CRON || "0 1 * * *",
    hoursThreshold: Number(process.env.ROTAS_ORFAS_HORAS) || undefined,
  };
}

async function tick() {
  if (_running) {
    logger.warn(`${TAG}: previous run still active — skipping`);
    return;
  }
  _running = true;
  _state.lastRunAt = new Date().toISOString();
  try {
    const cfg = loadConfig();
    const report = await rotasOrfasScanService.runOnce({
      hoursThreshold: cfg.hoursThreshold,
    });
    _state.lastReport = report;
    _state.lastStatus =
      report.canceled > 0 ? "success" : report.failed > 0 ? "partial" : "idle";
    _state.lastError = null;
  } catch (err) {
    _state.lastStatus = "error";
    _state.lastError = err?.message || "Erro inesperado";
    _state.lastReport = null;
    logger.error({ err }, `${TAG}: unexpected error`);
  } finally {
    _running = false;
  }
}

async function register() {
  const cfg = loadConfig();
  _state.enabled = cfg.enabled;
  _state.cronExpr = cfg.cronExpr;

  if (!cfg.enabled) {
    logger.info(`${TAG}: disabled (ROTAS_ORFAS_SCAN_ENABLED!=true)`);
    return;
  }
  if (!cron.validate(cfg.cronExpr)) {
    logger.error(
      { cronExpr: cfg.cronExpr },
      `${TAG}: invalid cron expression`,
    );
    return;
  }

  _task = cron.schedule(cfg.cronExpr, tick, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });
  logger.info({ cronExpr: cfg.cronExpr }, `${TAG}: scheduled`);
}

function stop() {
  if (_task) {
    _task.stop();
    _task = null;
    logger.info(`${TAG}: stopped`);
  }
}

function getState() {
  return {
    enabled: _state.enabled,
    cronExpr: _state.cronExpr,
    running: _running,
    lastRunAt: _state.lastRunAt,
    lastStatus: _state.lastStatus,
    lastError: _state.lastError,
    lastReport: _state.lastReport,
  };
}

module.exports = { register, stop, tick, getState };
