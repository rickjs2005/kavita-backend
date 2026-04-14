"use strict";

// jobs/leadFollowupJob.js
//
// Cron job diário que envia follow-ups pós-lead pedindo review.
// Padrão alinhado a jobs/climaSyncJob.js (mesma assinatura register/stop/getState).
//
// Config:
//   LEAD_FOLLOWUP_ENABLED  — "true" para ativar (default: false)
//   LEAD_FOLLOWUP_CRON     — default "0 10 * * *" (10:00 todo dia, BRT)
//   LEAD_FOLLOWUP_MAX      — default 100 (máximo por tick)

const cron = require("node-cron");
const logger = require("../lib/logger");
const leadFollowupService = require("../services/leadFollowupService");

const TAG = "lead-followup";

let _task = null;
let _running = false;

const _state = {
  enabled: false,
  cronExpr: null,
  lastRunAt: null,
  lastStatus: null,  // "success" | "error" | "skipped"
  lastError: null,
  lastReport: null,
};

function loadConfig() {
  return {
    enabled: String(process.env.LEAD_FOLLOWUP_ENABLED || "").toLowerCase() === "true",
    cronExpr: process.env.LEAD_FOLLOWUP_CRON || "0 10 * * *",
    maxPerTick: Number(process.env.LEAD_FOLLOWUP_MAX) || 100,
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
    const report = await leadFollowupService.runOnce({ maxPerTick: cfg.maxPerTick });
    _state.lastReport = report;
    _state.lastStatus = report.skipped ? "skipped" : report.failed > 0 ? "partial" : "success";
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
    logger.info(`${TAG}: disabled (LEAD_FOLLOWUP_ENABLED!=true)`);
    return;
  }
  if (!cron.validate(cfg.cronExpr)) {
    logger.error({ cronExpr: cfg.cronExpr }, `${TAG}: invalid cron expression`);
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
