"use strict";

// repositories/corretorasMetricsRepository.js
//
// Agregações SQL para o dashboard admin do Mercado do Café.
// Todas as queries respeitam o range [from, to) e usam índices existentes:
//   corretora_leads (created_at), (corretora_id, first_response_at),
//   corretora_subscriptions (corretora_id), corretora_reviews (status, created_at).
//
// Retornamos apenas números/arrays pequenos — nunca linhas brutas.

const pool = require("../config/pool");

/** Totais agregados do período. */
async function totals({ from, to }) {
  const [[leads]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?`,
    [from, to],
  );
  const [[responded]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_at IS NOT NULL`,
    [from, to],
  );
  const [[under1h]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
        AND first_response_seconds <= 3600`,
    [from, to],
  );
  const [[under24h]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
        AND first_response_seconds <= 86400`,
    [from, to],
  );
  const [[reviews]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected
     FROM corretora_reviews
     WHERE created_at >= ? AND created_at < ?`,
    [from, to],
  );
  return {
    leads: Number(leads?.total || 0),
    leads_responded: Number(responded?.total || 0),
    leads_under_1h: Number(under1h?.total || 0),
    leads_under_24h: Number(under24h?.total || 0),
    reviews_approved: Number(reviews?.approved || 0),
    reviews_pending: Number(reviews?.pending || 0),
    reviews_rejected: Number(reviews?.rejected || 0),
  };
}

/**
 * Série temporal de leads por dia. MySQL-friendly (DATE()).
 * Retorna array [{ day: "YYYY-MM-DD", total }] do período.
 */
async function leadsByDay({ from, to }) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
      GROUP BY DATE(created_at)
      ORDER BY day ASC`,
    [from, to],
  );
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
    total: Number(r.total),
  }));
}

/** Top cidades por volume de leads. */
async function leadsByCity({ from, to, limit = 10 }) {
  const [rows] = await pool.query(
    `SELECT cidade, COUNT(*) AS total
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND cidade IS NOT NULL AND cidade <> ''
      GROUP BY cidade
      ORDER BY total DESC
      LIMIT ?`,
    [from, to, Number(limit)],
  );
  return rows.map((r) => ({ cidade: r.cidade, total: Number(r.total) }));
}

/**
 * SLA p50/p90/avg. MySQL 8 tem função janela — usamos PERCENT_RANK/NTILE
 * ou ordenação manual. Para manter simples e portável, calculamos via
 * ORDER+LIMIT de offset (rápido com índice first_response_seconds).
 */
async function slaStats({ from, to }) {
  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL`,
    [from, to],
  );
  const n = Number(count?.total || 0);
  if (n === 0) return { count: 0, avg_seconds: null, p50_seconds: null, p90_seconds: null };

  const [[avg]] = await pool.query(
    `SELECT AVG(first_response_seconds) AS avg_s
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL`,
    [from, to],
  );

  const p50Offset = Math.floor(n * 0.5);
  const p90Offset = Math.floor(n * 0.9);

  const [p50rows] = await pool.query(
    `SELECT first_response_seconds AS v
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
      ORDER BY first_response_seconds ASC
      LIMIT 1 OFFSET ?`,
    [from, to, p50Offset],
  );
  const [p90rows] = await pool.query(
    `SELECT first_response_seconds AS v
       FROM corretora_leads
      WHERE created_at >= ? AND created_at < ?
        AND first_response_seconds IS NOT NULL
      ORDER BY first_response_seconds ASC
      LIMIT 1 OFFSET ?`,
    [from, to, p90Offset],
  );

  return {
    count: n,
    avg_seconds: Math.round(Number(avg?.avg_s || 0)),
    p50_seconds: Number(p50rows[0]?.v ?? null),
    p90_seconds: Number(p90rows[0]?.v ?? null),
  };
}

/** Distribuição de corretoras por plano atual ativo (snapshot atual, não do período). */
async function planDistribution() {
  const [rows] = await pool.query(
    `SELECT p.slug AS plan_slug, p.nome AS plan_nome, COUNT(s.id) AS total
       FROM plans p
  LEFT JOIN corretora_subscriptions s
         ON s.plan_id = p.id AND s.status = 'active'
   GROUP BY p.id, p.slug, p.nome
   ORDER BY p.price_cents ASC`,
  );
  return rows.map((r) => ({
    slug: r.plan_slug,
    nome: r.plan_nome,
    total: Number(r.total),
  }));
}

module.exports = { totals, leadsByDay, leadsByCity, slaStats, planDistribution };
