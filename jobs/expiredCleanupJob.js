"use strict";

// jobs/expiredCleanupJob.js
//
// Cron diário (default 00:30 BRT) que desativa promoções e hero slides
// com data final passada. Defensivo: o público já filtra por data,
// isso só limpa o estado persistido pra admin não ver fantasmas.
//
// Config:
//   EXPIRED_CLEANUP_ENABLED — "true" para ativar (default: true)
//   EXPIRED_CLEANUP_CRON    — default "30 0 * * *" (00:30 todo dia, BRT)

const cron = require("node-cron");
const logger = require("../lib/logger");
const expiredCleanupService = require("../services/expiredCleanupService");

const TAG = "expired-cleanup";

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
  // Default LIGADO — ao contrário dos outros jobs. Cleanup não envia
  // mensagem nem custa nada, só limpa flag interno. Não há razão
  // operacional pra deixar desligado em produção.
  const raw = String(process.env.EXPIRED_CLEANUP_ENABLED ?? "true").toLowerCase();
  return {
    enabled: raw !== "false" && raw !== "0",
    cronExpr: process.env.EXPIRED_CLEANUP_CRON || "30 0 * * *",
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
    const report = await expiredCleanupService.runOnce();
    _state.lastReport = report;
    _state.lastStatus =
      report.promotions > 0 || report.slides > 0 ? "success" : "idle";
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
    logger.info(`${TAG}: disabled (EXPIRED_CLEANUP_ENABLED=false)`);
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
