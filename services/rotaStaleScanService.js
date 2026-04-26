"use strict";
// services/rotaStaleScanService.js
//
// Fase 4 — alerta de rota parada (sem update ha tempo demais).
//
// Detecta rotas em status 'em_rota' cuja ultima atualizacao foi ha
// mais de THRESHOLD_HOURS (default 6h). Cobre o cenario do motorista:
//   - travou (sem sinal por horas, app fechou, esqueceu)
//   - iniciou mas nao marcou nenhuma parada
//   - perdeu o telefone / desistiu sem avisar
//
// READ-ONLY — nao muta estado, nao loga em audit, nao toca FSM.
// Endpoint companion: GET /admin/rotas/stale?olderThanHours=6
// Frontend (Fase 4): banner no /admin/rotas mostrando contagem.
//
// Sem cron neste primeiro corte. Admin descobre quando abrir o painel.
// Cron pode ser adicionado em fase futura espelhando staleLeadsScanJob.

const pool = require("../config/pool");

const DEFAULT_THRESHOLD_HOURS = 6;

function _resolveThreshold(opts = {}) {
  return (
    Number(opts.olderThanHours) ||
    Number(process.env.ROTA_STALE_HOURS) ||
    DEFAULT_THRESHOLD_HOURS
  );
}

/**
 * Lista rotas paradas. Read-only.
 *
 * Criterio:
 *   - status = 'em_rota'
 *   - updated_at < NOW() - olderThanHours
 *
 * Inclui dados leves do motorista pra render do banner.
 *
 * @param {{olderThanHours?: number}} [opts]
 * @returns {Promise<{
 *   items: Array<{
 *     id, data_programada, motorista_id, motorista_nome,
 *     iniciada_em, total_paradas, total_entregues,
 *     ultima_atualizacao, horas_paradas
 *   }>,
 *   threshold_hours: number,
 * }>}
 */
async function list(opts = {}) {
  const threshold = _resolveThreshold(opts);
  const [rows] = await pool.query(
    `SELECT r.id,
            r.data_programada,
            r.motorista_id,
            r.iniciada_em,
            r.total_paradas,
            r.total_entregues,
            r.updated_at AS ultima_atualizacao,
            TIMESTAMPDIFF(HOUR, r.updated_at, NOW()) AS horas_paradas,
            m.nome  AS motorista_nome,
            m.telefone AS motorista_telefone
       FROM rotas r
       LEFT JOIN motoristas m ON m.id = r.motorista_id
      WHERE r.status = 'em_rota'
        AND r.updated_at < (NOW() - INTERVAL ? HOUR)
      ORDER BY r.updated_at ASC`,
    [threshold],
  );
  return {
    items: rows,
    threshold_hours: threshold,
  };
}

module.exports = {
  list,
  DEFAULT_THRESHOLD_HOURS,
};
