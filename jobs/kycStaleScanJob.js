"use strict";

// jobs/kycStaleScanJob.js
//
// G5 da auditoria de automacao — scan diario de KYC parado.
//
// Config:
//   KYC_STALE_SCAN_ENABLED   "true" para ativar (default: false)
//   KYC_STALE_SCAN_CRON      default "0 9 * * *" (09:00 BRT)
//   KYC_STALE_PENDING_DAYS   default 7
//   KYC_STALE_REVIEW_DAYS    default 3

const cron = require("node-cron");
const logger = require("../lib/logger");
const kycStaleScanService = require("../services/kycStaleScanService");

const TAG = "kyc-stale-scan";

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
      String(process.env.KYC_STALE_SCAN_ENABLED || "").toLowerCase() === "true",
    cronExpr: process.env.KYC_STALE_SCAN_CRON || "0 9 * * *",
    pendingDays: Number(process.env.KYC_STALE_PENDING_DAYS) || undefined,
    reviewDays: Number(process.env.KYC_STALE_REVIEW_DAYS) || undefined,
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
    const report = await kycStaleScanService.runOnce({
      pendingDays: cfg.pendingDays,
      reviewDays: cfg.reviewDays,
    });
    _state.lastReport = report;
    _state.lastStatus = report.notified > 0 ? "success" : "idle";
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
    logger.info(`${TAG}: disabled (KYC_STALE_SCAN_ENABLED!=true)`);
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
