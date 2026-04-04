"use strict";

// jobs/climaSyncJob.js
//
// Cron job que sincroniza dados de chuva automaticamente.
// Registrado no boot do servidor (server.js).
//
// Env vars:
//   CLIMA_SYNC_ENABLED   — "true" para habilitar (default: false)
//   CLIMA_SYNC_CRON      — expressao cron (default: "0 */3 * * *" = a cada 3h)
//   CLIMA_SYNC_DELAY_MS  — delay entre cidades em ms (default: 1500)

const cron = require("node-cron");
const { syncAll } = require("../services/climaSyncService");

const TAG = "[clima-sync]";

let _task = null;
let _running = false;

/**
 * Executa o sync e loga o resultado. Protege contra execucao concorrente
 * caso o job anterior nao tenha terminado antes do proximo tick.
 */
async function tick() {
  if (_running) {
    console.warn(`${TAG} job anterior ainda em execucao, pulando tick`);
    return;
  }

  _running = true;
  const startedAt = new Date().toISOString();

  try {
    console.info(`${TAG} iniciando sync automatico...`);
    const report = await syncAll();

    console.info(`${TAG} concluido`, {
      startedAt,
      total: report.total,
      success: report.success,
      failed: report.failed,
      durationMs: report.durationMs,
    });

    if (report.failed > 0) {
      const failures = report.results.filter((r) => !r.ok);
      console.warn(`${TAG} falhas:`, failures);
    }
  } catch (err) {
    console.error(`${TAG} erro inesperado:`, err?.message || err);
  } finally {
    _running = false;
  }
}

/**
 * Registra o cron job. Chamado uma vez no boot do servidor.
 * Faz noop silencioso se CLIMA_SYNC_ENABLED != "true".
 */
function register() {
  const enabled = String(process.env.CLIMA_SYNC_ENABLED || "").toLowerCase() === "true";

  if (!enabled) {
    console.info(`${TAG} desabilitado (CLIMA_SYNC_ENABLED != true)`);
    return;
  }

  const cronExpr = process.env.CLIMA_SYNC_CRON || "0 */3 * * *";

  if (!cron.validate(cronExpr)) {
    console.error(`${TAG} expressao cron invalida: "${cronExpr}"`);
    return;
  }

  _task = cron.schedule(cronExpr, tick, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });

  console.info(`${TAG} agendado: "${cronExpr}" (timezone: America/Sao_Paulo)`);
}

/**
 * Para o cron job. Util para shutdown gracioso e testes.
 */
function stop() {
  if (_task) {
    _task.stop();
    _task = null;
    console.info(`${TAG} parado`);
  }
}

module.exports = { register, stop, tick };
