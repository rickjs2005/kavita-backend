"use strict";

// jobs/marketQuotesSyncJob.js
//
// Cron que sincroniza snapshots de cotação (Fase 10.4).
// Padrão alinhado aos demais jobs do projeto (climaSyncJob,
// cotacoesSyncJob): expõe `register()` async, chamado por
// bootstrap/workers.js após o server subir.
//
// Agendamento: padrão "0 18 * * 1-5" (18h BR em dias úteis, pós-
// fechamento CEPEA que publica até 17h). Pode ser ajustado via env
// MARKET_QUOTES_SYNC_CRON.
//
// Ativação: MARKET_QUOTES_SYNC_ENABLED=true em .env.

const cron = require("node-cron");
const logger = require("../lib/logger");
const marketQuotesService = require("../services/marketQuotesService");

const TAG = "market-quotes-sync";
const DEFAULT_EXPR = "0 18 * * 1-5";
const TZ = "America/Sao_Paulo";

let _task = null;
let _running = false;

async function tick() {
  if (_running) {
    logger.warn(`${TAG}: previous run still active — skipping tick`);
    return;
  }
  _running = true;
  try {
    const result = await marketQuotesService.syncAll();
    logger.info(
      { collected: result.collected, failed: result.failed },
      `${TAG}: tick complete`,
    );
  } catch (err) {
    logger.error(
      { err: err?.message ?? String(err) },
      `${TAG}: tick failed`,
    );
  } finally {
    _running = false;
  }
}

async function register() {
  const enabled =
    String(process.env.MARKET_QUOTES_SYNC_ENABLED || "").toLowerCase() ===
    "true";
  if (!enabled) {
    logger.info(`${TAG}: disabled (MARKET_QUOTES_SYNC_ENABLED!=true)`);
    return;
  }

  const expr = process.env.MARKET_QUOTES_SYNC_CRON || DEFAULT_EXPR;
  if (!cron.validate(expr)) {
    logger.error({ expr }, `${TAG}: expressão cron inválida — cron NÃO agendado`);
    return;
  }

  _task = cron.schedule(expr, () => void tick(), { timezone: TZ });
  logger.info({ cronExpr: expr, timezone: TZ }, `${TAG}: scheduled`);
}

function stop() {
  if (_task) {
    _task.stop();
    _task = null;
  }
}

module.exports = { register, stop, tick };
