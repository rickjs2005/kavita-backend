"use strict";

// jobs/climaSyncJob.js
//
// Cron job que sincroniza dados de chuva automaticamente.
// Registrado no boot do servidor (server.js → bootstrap/workers.js).
//
// Config priority: DB (news_sync_config) > env vars > defaults.
// Runtime state (last run, status) exposed via getState() for the admin UI.

const cron = require("node-cron");
const { syncAll } = require("../services/climaSyncService");
const logger = require("../lib/logger");

const TAG = "clima-sync";

let _task = null;
let _running = false;
let _cronExpr = null;

// Runtime state — ephemeral, reset on restart.
const _state = {
  enabled: false,
  cronExpr: null,
  lastRunAt: null,
  lastStatus: null,    // "success" | "partial" | "error" | null
  lastError: null,
  lastReport: null,    // { total, success, failed, durationMs }
};

/**
 * Reads config from DB, falls back to env vars, then defaults.
 */
async function loadConfig() {
  try {
    const repo = require("../repositories/newsSyncConfigRepository");
    const row = await repo.getConfig();
    if (row) {
      return {
        enabled: Boolean(row.clima_sync_enabled),
        cronExpr: row.clima_sync_cron || "0 */3 * * *",
        delayMs: row.clima_sync_delay_ms ?? 1500,
      };
    }
  } catch {
    // Table may not exist yet (migration pending) — fall through to env vars
  }

  return {
    enabled: String(process.env.CLIMA_SYNC_ENABLED || "").toLowerCase() === "true",
    cronExpr: process.env.CLIMA_SYNC_CRON || "0 */3 * * *",
    delayMs: Number(process.env.CLIMA_SYNC_DELAY_MS) || 1500,
  };
}

/**
 * Executa o sync e registra o resultado no runtime state.
 */
async function tick() {
  if (_running) {
    logger.warn(`${TAG}: previous run still active — skipping tick`);
    return;
  }

  _running = true;
  _state.lastRunAt = new Date().toISOString();

  try {
    logger.info(`${TAG}: starting auto sync`);
    const report = await syncAll();

    _state.lastReport = {
      total: report.total,
      success: report.success,
      failed: report.failed,
      durationMs: report.durationMs,
    };

    if (report.failed === 0) {
      _state.lastStatus = "success";
      _state.lastError = null;
    } else if (report.success > 0) {
      _state.lastStatus = "partial";
      _state.lastError = `${report.failed} cidade(s) falharam`;
    } else {
      _state.lastStatus = "error";
      _state.lastError = "Todas as cidades falharam";
    }

    logger.info({ report: _state.lastReport }, `${TAG}: sync complete`);

    if (report.failed > 0) {
      const failures = report.results.filter((r) => !r.ok);
      logger.warn({ failures }, `${TAG}: partial failures`);
    }
  } catch (err) {
    _state.lastStatus = "error";
    _state.lastError = err?.message || "Erro inesperado";
    _state.lastReport = null;
    logger.error({ err }, `${TAG}: unexpected error`);
  } finally {
    _running = false;
  }
}

/**
 * Registra o cron job. Lê config do DB (com fallback para env vars).
 */
async function register() {
  const cfg = await loadConfig();

  _state.enabled = cfg.enabled;
  _state.cronExpr = cfg.cronExpr;

  if (!cfg.enabled) {
    logger.info(`${TAG}: disabled (manual mode)`);
    return;
  }

  if (!cron.validate(cfg.cronExpr)) {
    logger.error({ cronExpr: cfg.cronExpr }, `${TAG}: invalid cron expression`);
    return;
  }

  _cronExpr = cfg.cronExpr;
  _task = cron.schedule(cfg.cronExpr, tick, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });

  logger.info({ cronExpr: cfg.cronExpr }, `${TAG}: scheduled`);
}

/**
 * Para o cron job.
 */
function stop() {
  if (_task) {
    _task.stop();
    _task = null;
    _cronExpr = null;
    logger.info(`${TAG}: stopped`);
  }
}

/**
 * Re-registra o cron job com nova config do DB. Chamado após update de config.
 */
async function restart() {
  stop();
  await register();
}

/**
 * Retorna runtime state para o admin UI.
 */
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

module.exports = { register, stop, restart, tick, getState };
