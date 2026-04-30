"use strict";

// jobs/webhookRetryJob.js
//
// B6 (Fase 1 go-live) — reprocessa webhooks Mercado Pago "parqueados".
//
// Quando o webhook MP chega antes do INSERT do pedido, ou quando o
// pedido foi cancelado entre /payment/start e o webhook,
// paymentWebhookService grava o evento com `processing_error`
// começando em `PARKED:PENDING_ORDER_MATCH:pedidoId=N`. Sem este job,
// esses eventos ficam pendurados para sempre — cliente pagou e o
// status nunca atualiza.
//
// Este job:
//   1. Busca eventos parqueados via paymentRepository.findParkedPendingOrderMatch
//   2. Para cada um: tenta reprocessar via paymentWebhookService.handleWebhookEvent
//      reusando o provider_event_id original (idempotente por design).
//   3. Após N tentativas, marca como RETRY_EXHAUSTED + alerta Sentry.
//
// Concurrency-safe: se a execução anterior ainda roda, a nova é skipped.
// Cada evento é processado serialmente para evitar pressão de DB.
//
// Config (env):
//   WEBHOOK_RETRY_JOB_ENABLED       "true" liga o job. Default: false.
//   WEBHOOK_RETRY_JOB_INTERVAL_MS   intervalo. Default: 60000 (1 min). Mín 30s.
//   WEBHOOK_RETRY_JOB_BATCH         eventos por tick. Default: 50.
//   WEBHOOK_RETRY_JOB_MAX_ATTEMPTS  após esse retry_count, marca EXHAUSTED.
//                                   Default: 288 (~24h em janelas de 5min).

const logger = require("../lib/logger");
const sentry = require("../lib/sentry");
const pool = require("../config/pool");
const paymentRepo = require("../repositories/paymentRepository");
const { handleWebhookEvent } = require("../services/paymentWebhookService");

const TAG = "webhook-retry";
const DEFAULT_INTERVAL_MS = 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;
const DEFAULT_BATCH = 50;
const DEFAULT_MAX_ATTEMPTS = 288;

let _timer = null;
let _running = false;
let _startedAt = null;

const _state = {
  enabled: false,
  intervalMs: null,
  batch: null,
  maxAttempts: null,
  lastRunAt: null,
  lastStatus: null,           // "success" | "skipped" | "error"
  lastError: null,
  lastReport: null,           // { scanned, processed, exhausted, errors, durationMs }
  totalRuns: 0,
};

function parseBoolDefault(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function loadConfig() {
  const rawInterval = Number(process.env.WEBHOOK_RETRY_JOB_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
      ? rawInterval
      : DEFAULT_INTERVAL_MS;

  const rawBatch = Number(process.env.WEBHOOK_RETRY_JOB_BATCH);
  const batch =
    Number.isFinite(rawBatch) && rawBatch > 0 && rawBatch <= 500
      ? Math.floor(rawBatch)
      : DEFAULT_BATCH;

  const rawMaxAttempts = Number(process.env.WEBHOOK_RETRY_JOB_MAX_ATTEMPTS);
  const maxAttempts =
    Number.isFinite(rawMaxAttempts) && rawMaxAttempts > 0
      ? Math.floor(rawMaxAttempts)
      : DEFAULT_MAX_ATTEMPTS;

  return {
    enabled: parseBoolDefault(process.env.WEBHOOK_RETRY_JOB_ENABLED, false),
    intervalMs,
    batch,
    maxAttempts,
  };
}

/**
 * Extrai o pedidoId do marker `PARKED:PENDING_ORDER_MATCH:pedidoId=N`.
 * Retorna null se o formato for inesperado (não tenta processar).
 */
function extractPedidoIdFromMarker(marker) {
  if (typeof marker !== "string") return null;
  const m = marker.match(/^PARKED:PENDING_ORDER_MATCH:pedidoId=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Confere rapidamente se o pedido EXISTE agora — evita gastar uma
 * iteração completa de handleWebhookEvent (que abre transação) quando
 * sabemos que vai cair no mesmo ramo "pedido_inexistente" outra vez.
 */
async function pedidoExists(pedidoId) {
  const [[row]] = await pool.query(
    "SELECT id FROM pedidos WHERE id = ? LIMIT 1",
    [pedidoId],
  );
  return Boolean(row);
}

/**
 * Marca um evento como RETRY_EXHAUSTED — finalizado e alerta de Sentry.
 * Apenas atualiza processing_error e processed_at. retry_count não é
 * tocado aqui para manter a auditoria fiel.
 */
async function markExhausted(eventId, pedidoId, retryCount) {
  await pool.query(
    `UPDATE webhook_events
        SET processed_at = NOW(),
            processing_error = ?
      WHERE id = ?`,
    [`RETRY_EXHAUSTED:PENDING_ORDER_MATCH:pedidoId=${pedidoId};attempts=${retryCount}`, eventId],
  );
  sentry.captureMessage(
    "webhook.retry.exhausted — evento parqueado nunca encontrou o pedido",
    "error",
    {
      tags: { domain: "payment.webhook.retry_exhausted" },
      extra: { webhookEventId: eventId, pedidoId, retryCount },
    },
  );
  logger.error(
    { tag: TAG, webhookEventId: eventId, pedidoId, retryCount },
    "webhook.retry.exhausted",
  );
}

/**
 * Reprocessa um único evento parqueado. Retorna `processed`,
 * `still_parked` (pedido ainda não existe), `exhausted` ou `error`.
 */
async function processOne(row, maxAttempts) {
  const eventId = row.id;
  const providerEventId = row.provider_event_id;
  const pedidoIdRef = extractPedidoIdFromMarker(row.processing_error);

  if (pedidoIdRef === null) {
    // Marker malformado — não conseguimos reprocessar, mas também não
    // queremos repetir indefinidamente. Marca como EXHAUSTED com aviso.
    await pool.query(
      `UPDATE webhook_events
          SET processed_at = NOW(),
              processing_error = ?
        WHERE id = ?`,
      ["RETRY_EXHAUSTED:UNPARSEABLE_MARKER", eventId],
    );
    logger.warn(
      { tag: TAG, webhookEventId: eventId, marker: row.processing_error },
      "webhook.retry.unparseable_marker",
    );
    return "exhausted";
  }

  if ((row.retry_count || 0) >= maxAttempts) {
    await markExhausted(eventId, pedidoIdRef, row.retry_count);
    return "exhausted";
  }

  if (!(await pedidoExists(pedidoIdRef))) {
    // Pedido ainda não apareceu — não chama handleWebhookEvent (que
    // tentaria a mesma transação por nada). retry_count será incrementado
    // pelo handleWebhookEvent na próxima vez que o evento for revisitado;
    // aqui só logamos.
    logger.debug(
      { tag: TAG, webhookEventId: eventId, pedidoId: pedidoIdRef },
      "webhook.retry.still_parked",
    );
    return "still_parked";
  }

  // Pedido existe — reprocessa via service. Como o evento já foi
  // inserido em webhook_events, o handleWebhookEvent vai cair no caminho
  // "evento já existe" e atualizar status_pagamento conforme o status
  // real do pagamento na MP API. Idempotente.
  let payload;
  try {
    payload = typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload || {});
  } catch {
    payload = "{}";
  }

  // O paymentWebhookService grava `payload` enriquecido com `_meta.signature`
  // dentro do JSON. Recuperamos a signature original do enriched payload se
  // existir; senão null (o handle re-grava o que tiver).
  let signatureHeader = null;
  let bodyForReplay = payload;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && parsed._meta) {
      signatureHeader = parsed._meta.signature ?? null;
      bodyForReplay = JSON.stringify(parsed.body ?? {});
    }
  } catch {
    // payload corrompido — segue com bodyForReplay = payload literal
  }

  try {
    const outcome = await handleWebhookEvent({
      eventId: providerEventId,
      type: row.event_type || "payment",
      dataId: null,           // será extraído do payload remoto pelo service via API MP
      payload: bodyForReplay,
      signatureHeader,
    });
    logger.info(
      {
        tag: TAG,
        webhookEventId: eventId,
        providerEventId,
        pedidoId: pedidoIdRef,
        outcome,
      },
      "webhook.retry.processed",
    );
    return "processed";
  } catch (err) {
    logger.error(
      {
        tag: TAG,
        err: err?.message,
        webhookEventId: eventId,
        pedidoId: pedidoIdRef,
      },
      "webhook.retry.failed",
    );
    sentry.captureException(err, {
      tags: { domain: "payment.webhook.retry" },
      extra: { webhookEventId: eventId, pedidoId: pedidoIdRef },
    });
    return "error";
  }
}

/**
 * Executa uma rodada do job. Concurrency-safe.
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

  const cfg = loadConfig();
  let scanned = 0;
  let processed = 0;
  let stillParked = 0;
  let exhausted = 0;
  let errors = 0;

  try {
    const rows = await paymentRepo.findParkedPendingOrderMatch(cfg.batch);
    logger.info(
      { tag: TAG, candidates: rows.length, batch: cfg.batch },
      "webhook.retry.started",
    );

    for (const row of rows) {
      scanned += 1;
      const outcome = await processOne(row, cfg.maxAttempts);
      if (outcome === "processed") processed += 1;
      else if (outcome === "still_parked") stillParked += 1;
      else if (outcome === "exhausted") exhausted += 1;
      else if (outcome === "error") errors += 1;
    }

    _state.lastReport = {
      scanned,
      processed,
      stillParked,
      exhausted,
      errors,
      durationMs: Date.now() - startedAt,
    };
    _state.lastStatus = "success";
    _state.lastError = null;
  } catch (err) {
    _state.lastStatus = "error";
    _state.lastError = err?.message || "Erro inesperado";
    _state.lastReport = { scanned, processed, stillParked, exhausted, errors };
    logger.error({ err, tag: TAG }, `${TAG}: unexpected error`);
    sentry.captureException(err, { tags: { domain: "payment.webhook.retry_job" } });
  } finally {
    _running = false;
  }
}

async function register(opts = {}) {
  if (_timer) {
    logger.warn({ tag: TAG }, `${TAG}: already registered — skipping`);
    return;
  }

  const cfg = loadConfig();
  _state.enabled = cfg.enabled;
  _state.intervalMs = cfg.intervalMs;
  _state.batch = cfg.batch;
  _state.maxAttempts = cfg.maxAttempts;

  if (!cfg.enabled) {
    // Em produção, retry job DESLIGADO é regressão silenciosa do B6:
    // qualquer evento que cair no marker PARKED:PENDING_ORDER_MATCH fica
    // pendurado para sempre. Loga em ERROR + tenta Sentry pra que o sinal
    // seja impossível de ignorar em logs de boot.
    if (process.env.NODE_ENV === "production") {
      const msg =
        `${TAG}: DISABLED in production — webhook events parked by ` +
        "MP race conditions will NEVER be retried. " +
        "Set WEBHOOK_RETRY_JOB_ENABLED=true to enable. " +
        "Refs: go-live tracker B6, troubleshooting-fase1.md.";
      logger.error({ tag: TAG }, msg);
      try {
        // Best-effort: lib/sentry retorna no-op se SENTRY_DSN não setado.
        const sentry = require("../lib/sentry");
        if (sentry && typeof sentry.captureMessage === "function") {
          sentry.captureMessage(msg, "warning", {
            tags: { domain: "payment.webhook.retry_job_disabled_in_prod" },
          });
        }
      } catch {
        // sentry indisponível — log já registrou
      }
    } else {
      logger.info(
        { tag: TAG },
        `${TAG}: disabled (WEBHOOK_RETRY_JOB_ENABLED!=true)`,
      );
    }
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
  if (typeof _timer.unref === "function") _timer.unref();

  _startedAt = new Date().toISOString();

  logger.info(
    {
      tag: TAG,
      intervalMs: cfg.intervalMs,
      batch: cfg.batch,
      maxAttempts: cfg.maxAttempts,
    },
    `${TAG}: scheduled`,
  );
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
    batch: _state.batch,
    maxAttempts: _state.maxAttempts,
    running: _running,
    startedAt: _startedAt,
    lastRunAt: _state.lastRunAt,
    lastStatus: _state.lastStatus,
    lastError: _state.lastError,
    lastReport: _state.lastReport,
    totalRuns: _state.totalRuns,
  };
}

module.exports = {
  register,
  stop,
  tick,
  getState,
  // exports internos pra teste
  _internal: { extractPedidoIdFromMarker, processOne, loadConfig },
};
