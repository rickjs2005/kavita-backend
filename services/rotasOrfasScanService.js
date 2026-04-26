"use strict";
// services/rotasOrfasScanService.js
//
// Bug 3 (analise de fluxo Pedidos<->Rotas, 2026-04-25) — auto-cancela
// rotas "orfas": status='em_rota' sem nenhum update ha mais de N horas
// (default 24). Cobre o cenario:
//   - motorista iniciou a rota e abandonou (perdeu o telefone, desistiu)
//   - paradas ficam travadas em 'pendente' indefinidamente
//   - pedidos nao retornam pro pool de disponiveis
//   - admin nao percebe ate o cliente reclamar
//
// Diferenca pro rotaStaleScanService (existente, fase 4):
//   - rotaStaleScanService: READ-ONLY, lista pra ALERTAR no painel (6h)
//   - rotasOrfasScanService: AUTO-CANCELA via cron noturno (24h)
//
// Cancelamento usa rotasService.alterarStatus -> respeita FSM.
// em_rota -> cancelada e' transicao valida.
//
// Default DESLIGADO via env. Operacional ativa quando o pilot validar.

const pool = require("../config/pool");
const logger = require("../lib/logger");
const rotasService = require("./rotasService");

const DEFAULT_THRESHOLD_HOURS = 24;

function _resolveThreshold(opts = {}) {
  return (
    Number(opts.hoursThreshold) ||
    Number(process.env.ROTAS_ORFAS_HORAS) ||
    DEFAULT_THRESHOLD_HOURS
  );
}

/**
 * Lista candidatas (read-only, util pra dry-run e testes).
 * @returns {Promise<Array<{id:number, motorista_id:number|null,
 *   updated_at:Date, horas_paradas:number}>>}
 */
async function list(opts = {}) {
  const threshold = _resolveThreshold(opts);
  const [rows] = await pool.query(
    `SELECT id, motorista_id, updated_at,
            TIMESTAMPDIFF(HOUR, updated_at, NOW()) AS horas_paradas
       FROM rotas
      WHERE status = 'em_rota'
        AND updated_at < (NOW() - INTERVAL ? HOUR)
      ORDER BY updated_at ASC`,
    [threshold],
  );
  return rows;
}

/**
 * Roda 1 ciclo do scan. Nao lanca — falha de UMA rota nao trava as demais.
 *
 * @param {{hoursThreshold?: number}} [opts]
 * @returns {Promise<{
 *   detected: number,
 *   canceled: number,
 *   failed: number,
 *   threshold_hours: number,
 *   ids_canceled: number[],
 * }>}
 */
async function runOnce(opts = {}) {
  const threshold = _resolveThreshold(opts);
  const report = {
    detected: 0,
    canceled: 0,
    failed: 0,
    threshold_hours: threshold,
    ids_canceled: [],
  };

  let candidatas;
  try {
    candidatas = await list({ hoursThreshold: threshold });
  } catch (err) {
    logger.error({ err }, "rotas-orfas-scan.list_failed");
    return report;
  }

  report.detected = candidatas.length;
  if (candidatas.length === 0) return report;

  for (const rota of candidatas) {
    try {
      await rotasService.alterarStatus(rota.id, "cancelada");
      report.canceled += 1;
      report.ids_canceled.push(rota.id);
      logger.info(
        {
          rotaId: rota.id,
          motoristaId: rota.motorista_id,
          horasParadas: rota.horas_paradas,
        },
        "rotas-orfas-scan.canceled",
      );
    } catch (err) {
      report.failed += 1;
      logger.error(
        { err, rotaId: rota.id },
        "rotas-orfas-scan.cancel_failed",
      );
    }
  }

  logger.info(report, "rotas-orfas-scan.done");
  return report;
}

module.exports = { runOnce, list, DEFAULT_THRESHOLD_HOURS };
