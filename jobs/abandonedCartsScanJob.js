"use strict";

// jobs/abandonedCartsScanJob.js
//
// Job periodico que promove carrinhos abertos antigos para
// carrinhos_abandonados (alimenta /admin/carrinhos e a fila do worker
// de notificacoes).
//
// Padrao alinhado a jobs/climaSyncJob.js e jobs/leadFollowupJob.js
// (mesma assinatura register/stop/tick/getState).
//
// Config:
//   ABANDONED_CART_SCAN_ENABLED    — "false" desativa. Default: enabled.
//   ABANDONED_CART_SCAN_INTERVAL_MS — intervalo entre execucoes. Default: 900000 (15min).
//   ABANDONED_CART_MIN_HOURS       — idade minima do carrinho. Default: ABANDON_CART_HOURS || 24.
//
// Em NODE_ENV=test o job nao inicia automaticamente (opt-in via
// register({ force: true }) nos testes).

const logger = require("../lib/logger");
const cartsAdminService = require("../services/cartsAdminService");

const TAG = "abandoned-carts-scan";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos
const MIN_INTERVAL_MS = 60 * 1000;          // 1 minuto (evita rodar em loop)

let _timer = null;
let _running = false;
let _startedAt = null;

const _state = {
  enabled: false,
  intervalMs: null,
  minHours: null,
  lastRunAt: null,
  lastStatus: null,  // "success" | "skipped" | "error"
  lastError: null,
  lastReport: null,  // { candidates, inserted, skippedEmpty, durationMs, minHours }
  totalRuns: 0,
};

function parseBoolDefault(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function loadConfig() {
  const rawInterval = Number(process.env.ABANDONED_CART_SCAN_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
      ? rawInterval
      : DEFAULT_INTERVAL_MS;

  const rawMinHours = Number(
    process.env.ABANDONED_CART_MIN_HOURS ?? process.env.ABANDON_CART_HOURS,
  );
  const minHours =
    Number.isFinite(rawMinHours) && rawMinHours > 0 ? rawMinHours : 24;

  return {
    enabled: parseBoolDefault(process.env.ABANDONED_CART_SCAN_ENABLED, true),
    intervalMs,
    minHours,
  };
}

/**
 * Executa uma rodada. Idempotente: o service ja filtra carrinhos que
 * ja estao em carrinhos_abandonados (ca.id IS NULL).
 * Concurrency-safe: se uma execucao ainda esta em andamento, pula.
 */
async function tick() {
  if (_running) {
    logger.warn({ tag: TAG }, `${TAG}: previous run still active — skipping`);
    _state.lastStatus = "skipped";
    return;
  }

  _running = true;
  const startedAt = Date.now();
  _state.lastRunAt = new Date().toISOString();
  _state.totalRuns += 1;

  try {
    const { minHours } = loadConfig();
    const report = await cartsAdminService.scanAbandonedCarts(minHours);

    _state.lastReport = {
      ...report,
      durationMs: Date.now() - startedAt,
    };
    _state.lastStatus = "success";
    _state.lastError = null;

    logger.info(
      { tag: TAG, report: _state.lastReport },
      `${TAG}: scan complete`,
    );
  } catch (err) {
    _state.lastStatus = "error";
    _state.lastError = err?.message || "Erro inesperado";
    _state.lastReport = null;
    logger.error({ err, tag: TAG }, `${TAG}: unexpected error`);
  } finally {
    _running = false;
  }
}

/**
 * Registra o job. Idempotente: chamar duas vezes nao cria dois timers.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.force]  ignora o guard de NODE_ENV=test
 */
async function register(opts = {}) {
  if (_timer) {
    logger.warn({ tag: TAG }, `${TAG}: already registered — skipping`);
    return;
  }

  const cfg = loadConfig();
  _state.enabled = cfg.enabled;
  _state.intervalMs = cfg.intervalMs;
  _state.minHours = cfg.minHours;

  if (!cfg.enabled) {
    logger.info({ tag: TAG }, `${TAG}: disabled (ABANDONED_CART_SCAN_ENABLED=false)`);
    return;
  }

  const isTest = process.env.NODE_ENV === "test";
  if (isTest && !opts.force) {
    logger.info({ tag: TAG }, `${TAG}: skipped (NODE_ENV=test)`);
    return;
  }

  _timer = setInterval(() => {
    tick().catch((err) => {
      logger.error({ err, tag: TAG }, `${TAG}: tick swallowed error`);
    });
  }, cfg.intervalMs);

  // Importante: nao segura o event loop no shutdown.
  if (typeof _timer.unref === "function") _timer.unref();

  _startedAt = new Date().toISOString();

  logger.info(
    { tag: TAG, intervalMs: cfg.intervalMs, minHours: cfg.minHours },
    `${TAG}: scheduled (interval ${Math.round(cfg.intervalMs / 1000)}s, minHours ${cfg.minHours})`,
  );

  // Primeira execucao apos 5s para nao atrasar o boot do servidor,
  // mas ainda processar carrinhos pendentes logo.
  setTimeout(() => {
    tick().catch((err) => {
      logger.error({ err, tag: TAG }, `${TAG}: initial tick error`);
    });
  }, 5000).unref?.();
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info({ tag: TAG }, `${TAG}: stopped`);
  }
}

function getState() {
  return {
    enabled: _state.enabled,
    intervalMs: _state.intervalMs,
    minHours: _state.minHours,
    running: _running,
    startedAt: _startedAt,
    lastRunAt: _state.lastRunAt,
    lastStatus: _state.lastStatus,
    lastError: _state.lastError,
    lastReport: _state.lastReport,
    totalRuns: _state.totalRuns,
  };
}

module.exports = { register, stop, tick, getState };
