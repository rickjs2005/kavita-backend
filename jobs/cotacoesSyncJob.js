"use strict";

// jobs/cotacoesSyncJob.js
//
// Cron job que sincroniza cotações automaticamente com fontes externas
// (BCB PTAX, Stooq).
// Registrado no boot do servidor (server.js → bootstrap/workers.js).
//
// Padrão: idêntico ao climaSyncJob.js — env vars > defaults.
// Reusa cotacoesAdminService.syncAll() para evitar duplicação de lógica.

const cron = require("node-cron");
const logger = require("../lib/logger");
const { syncAll } = require("../services/cotacoesAdminService");

const TAG = "[cotacoes-sync]";

let _task = null;
let _running = false;

// Runtime state — ephemeral, reset on restart.
const _state = {
  enabled: false,
  cronExpr: null,
  lastRunAt: null,
  lastStatus: null, // "success" | "partial" | "error" | null
  lastError: null,
  lastReport: null, // { total, ok, error, durationMs }
};

/**
 * Reads config from env vars.
 */
function loadConfig() {
  return {
    enabled:
      String(process.env.COTACOES_SYNC_ENABLED || "").toLowerCase() === "true",
    cronExpr: process.env.COTACOES_SYNC_CRON || "0 */4 * * *",
  };
}

/**
 * Executa o sync e registra o resultado no runtime state.
 */
async function tick() {
  if (_running) {
    logger.warn(`${TAG} job anterior ainda em execução, pulando tick`);
    return;
  }

  _running = true;
  _state.lastRunAt = new Date().toISOString();

  const t0 = Date.now();

  try {
    logger.info(`${TAG} iniciando sync automático...`);

    // syncAll() from cotacoesAdminService already:
    // - filters ativo=1
    // - iterates each cotação calling syncOne()
    // - catches per-item exceptions
    // - returns { total, ok, error, items }
    const summary = await syncAll();

    const durationMs = Date.now() - t0;

    _state.lastReport = {
      total: summary.total,
      ok: summary.ok,
      error: summary.error,
      durationMs,
    };

    if (summary.error === 0) {
      _state.lastStatus = "success";
      _state.lastError = null;
    } else if (summary.ok > 0) {
      _state.lastStatus = "partial";
      _state.lastError = `${summary.error} cotação(ões) falharam`;
    } else {
      _state.lastStatus = "error";
      _state.lastError = "Todas as cotações falharam";
    }

    logger.info(
      { ...(_state.lastReport) },
      `${TAG} concluído — ${summary.ok} ok, ${summary.error} erro(s), ${durationMs}ms`,
    );

    if (summary.error > 0) {
      const failures = summary.items.filter((i) => i.status === "error");
      logger.warn(
        { failures },
        `${TAG} cotações com falha`,
      );
    }
  } catch (err) {
    _state.lastStatus = "error";
    _state.lastError = err?.message || "Erro inesperado";
    _state.lastReport = null;
    logger.error({ err }, `${TAG} erro inesperado`);
  } finally {
    _running = false;
  }
}

/**
 * Registra o cron job.
 */
function register() {
  const cfg = loadConfig();

  _state.enabled = cfg.enabled;
  _state.cronExpr = cfg.cronExpr;

  if (!cfg.enabled) {
    logger.info(`${TAG} desabilitado (COTACOES_SYNC_ENABLED != true)`);
    return;
  }

  if (!cron.validate(cfg.cronExpr)) {
    logger.error(`${TAG} expressão cron inválida: "${cfg.cronExpr}"`);
    return;
  }

  _task = cron.schedule(cfg.cronExpr, tick, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });

  logger.info(`${TAG} agendado: "${cfg.cronExpr}" (timezone: America/Sao_Paulo)`);
}

/**
 * Para o cron job.
 */
function stop() {
  if (_task) {
    _task.stop();
    _task = null;
    logger.info(`${TAG} parado`);
  }
}

/**
 * Retorna runtime state para diagnóstico / admin UI.
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

module.exports = { register, stop, tick, getState };
