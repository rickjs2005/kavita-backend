"use strict";

// jobs/trialReminderJob.js
//
// Cron diário que dispara os e-mails de fim de trial (7d, 3d, 1d,
// expirado). Usa o mesmo padrão do leadFollowupJob.
//
// Config:
//   TRIAL_REMINDER_ENABLED  — "true" para ativar (default: false)
//   TRIAL_REMINDER_CRON     — default "0 9 * * *" (09:00 todo dia, BRT)

const cron = require("node-cron");
const logger = require("../lib/logger");
const trialReminderService = require("../services/trialReminderService");

const TAG = "trial-reminder";

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
      String(process.env.TRIAL_REMINDER_ENABLED || "").toLowerCase() === "true",
    cronExpr: process.env.TRIAL_REMINDER_CRON || "0 9 * * *",
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
    const report = await trialReminderService.runOnce();
    _state.lastReport = report;
    _state.lastStatus =
      report.failed > 0 ? "partial" : report.sent > 0 ? "success" : "idle";
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
    logger.info(`${TAG}: disabled (TRIAL_REMINDER_ENABLED!=true)`);
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
