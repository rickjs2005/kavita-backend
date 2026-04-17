// repositories/corretoraPanelAnalyticsRepository.js
//
// Agregações SQL para o painel INTERNO da corretora. Todas as queries
// filtram por corretora_id explícito — sem vazamento cross-tenant.
//
// Distinto de corretorasMetricsRepository (admin, visão global).
// Queries similares em estrutura mas parametrizadas por tenant.
//
// Reaproveitamento de índices existentes:
//   corretora_leads (corretora_id, created_at)
//   corretora_leads (corretora_id, first_response_seconds)
//   corretoras (city)
"use strict";

const pool = require("../config/pool");

/** Totais agregados do período da própria corretora. */
async function totals({ corretoraId, from, to }) {
  const [[leads]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?`,
    [corretoraId, from, to],
  );
  const [[responded]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_at IS NOT NULL`,
    [corretoraId, from, to],
  );
  const [[under1h]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
        AND first_response_seconds <= 3600`,
    [corretoraId, from, to],
  );
  const [[under24h]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
        AND first_response_seconds <= 86400`,
    [corretoraId, from, to],
  );
  // Funil por status (totais crus).
  const [[funnel]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status='new'       THEN 1 ELSE 0 END) AS status_new,
       SUM(CASE WHEN status='contacted' THEN 1 ELSE 0 END) AS status_contacted,
       SUM(CASE WHEN status='closed'    THEN 1 ELSE 0 END) AS status_closed,
       SUM(CASE WHEN status='lost'      THEN 1 ELSE 0 END) AS status_lost
     FROM corretora_leads
     WHERE corretora_id = ? AND created_at >= ? AND created_at < ?`,
    [corretoraId, from, to],
  );

  return {
    leads: Number(leads?.total || 0),
    leads_responded: Number(responded?.total || 0),
    leads_under_1h: Number(under1h?.total || 0),
    leads_under_24h: Number(under24h?.total || 0),
    status_new: Number(funnel?.status_new || 0),
    status_contacted: Number(funnel?.status_contacted || 0),
    status_closed: Number(funnel?.status_closed || 0),
    status_lost: Number(funnel?.status_lost || 0),
  };
}

/** Série temporal de leads/dia do tenant. */
async function leadsByDay({ corretoraId, from, to }) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY DATE(created_at)
      ORDER BY day ASC`,
    [corretoraId, from, to],
  );
  return rows.map((r) => ({
    day:
      r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : String(r.day),
    total: Number(r.total),
  }));
}

/**
 * SLA p50/p90/avg do tenant. Mesmo método de corretorasMetricsRepository
 * (ORDER + LIMIT OFFSET) — portável MySQL 5.7+ e rápido com índice.
 */
async function slaStats({ corretoraId, from, to }) {
  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL`,
    [corretoraId, from, to],
  );
  const n = Number(count?.total || 0);
  if (n === 0) {
    return {
      count: 0,
      avg_seconds: null,
      p50_seconds: null,
      p90_seconds: null,
    };
  }

  const [[avg]] = await pool.query(
    `SELECT AVG(first_response_seconds) AS avg_s
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL`,
    [corretoraId, from, to],
  );

  const p50Offset = Math.floor(n * 0.5);
  const p90Offset = Math.floor(n * 0.9);

  const [p50rows] = await pool.query(
    `SELECT first_response_seconds AS v
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
      ORDER BY first_response_seconds ASC
      LIMIT 1 OFFSET ?`,
    [corretoraId, from, to, p50Offset],
  );
  const [p90rows] = await pool.query(
    `SELECT first_response_seconds AS v
       FROM corretora_leads
      WHERE corretora_id = ? AND created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
      ORDER BY first_response_seconds ASC
      LIMIT 1 OFFSET ?`,
    [corretoraId, from, to, p90Offset],
  );

  return {
    count: n,
    avg_seconds: Math.round(Number(avg?.avg_s || 0)),
    p50_seconds: Number(p50rows[0]?.v ?? null),
    p90_seconds: Number(p90rows[0]?.v ?? null),
  };
}

/**
 * Comparativo regional ANÔNIMO: SLA médio e volume de leads das OUTRAS
 * corretoras da mesma cidade no período. Não retorna identidades nem
 * SLA individual — só a média agregada e o tamanho da amostra, para o
 * tenant ver "você está acima/abaixo da média da sua cidade".
 *
 * Amostra mínima (REGIONAL_MIN_SAMPLE) evita comparar com 1 corretora
 * só — estatisticamente inútil e quase-identificável.
 */
const REGIONAL_MIN_SAMPLE = 5;

async function regionalComparison({ corretoraId, from, to }) {
  const [[{ city } = {}]] = await pool.query(
    "SELECT city FROM corretoras WHERE id = ? LIMIT 1",
    [corretoraId],
  );
  if (!city) {
    return { city: null, region_avg_seconds: null, region_sample_size: 0 };
  }

  const [[row]] = await pool.query(
    `SELECT
       COUNT(l.id) AS sample_size,
       AVG(l.first_response_seconds) AS avg_s
     FROM corretora_leads l
     JOIN corretoras c ON c.id = l.corretora_id
     WHERE c.city = ?
       AND c.id <> ?
       AND c.status = 'active'
       AND c.deleted_at IS NULL
       AND l.created_at >= ? AND l.created_at < ?
       AND l.first_response_seconds IS NOT NULL`,
    [city, corretoraId, from, to],
  );

  const sampleSize = Number(row?.sample_size || 0);
  if (sampleSize < REGIONAL_MIN_SAMPLE) {
    // Amostra insuficiente — não exibir comparativo para não enganar.
    return { city, region_avg_seconds: null, region_sample_size: sampleSize };
  }

  return {
    city,
    region_avg_seconds: Math.round(Number(row?.avg_s || 0)),
    region_sample_size: sampleSize,
  };
}

module.exports = {
  totals,
  leadsByDay,
  slaStats,
  regionalComparison,
  REGIONAL_MIN_SAMPLE,
};
