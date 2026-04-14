// repositories/corretoraRegionalStatsRepository.js
//
// Queries agregadas para o dashboard regional do admin. Focadas em
// Manhuaçu e Zona da Mata. Tudo read-only, sem side effects.
//
// Performance: todas as queries usam índices criados nas migrations:
//   - idx_leads_corretora_status (para count by status)
//   - idx_leads_corretora_volume (para high priority count)
//   - idx_leads_corretora_response (para SLA)

"use strict";

const pool = require("../config/pool");

/**
 * KPIs gerais do admin — visão única do ecossistema regional.
 * Retorna contadores do mês atual por default (params opcionais).
 */
async function getRegionalKpis({ daysBack = 30 } = {}) {
  const [[kpis]] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM corretoras WHERE status = 'active') AS corretoras_ativas,
      (SELECT COUNT(DISTINCT c.city)
         FROM corretoras c WHERE status = 'active') AS cidades_cobertas,
      (SELECT COUNT(*) FROM corretora_leads
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS leads_periodo,
      (SELECT COUNT(*) FROM corretora_leads
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           AND volume_range IN ('200_500', '500_mais')) AS leads_alta_prioridade,
      (SELECT COUNT(*) FROM corretora_leads
         WHERE status = 'closed'
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS leads_fechados,
      (SELECT AVG(first_response_seconds) FROM corretora_leads
         WHERE first_response_seconds IS NOT NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS sla_medio_segundos,
      (SELECT COUNT(*) FROM corretora_submissions
         WHERE status = 'pending') AS submissions_pendentes
    `,
    [daysBack, daysBack, daysBack, daysBack],
  );

  return {
    corretoras_ativas: Number(kpis.corretoras_ativas || 0),
    cidades_cobertas: Number(kpis.cidades_cobertas || 0),
    leads_periodo: Number(kpis.leads_periodo || 0),
    leads_alta_prioridade: Number(kpis.leads_alta_prioridade || 0),
    leads_fechados: Number(kpis.leads_fechados || 0),
    sla_medio_segundos: kpis.sla_medio_segundos
      ? Math.round(Number(kpis.sla_medio_segundos))
      : null,
    submissions_pendentes: Number(kpis.submissions_pendentes || 0),
    days_back: daysBack,
  };
}

/**
 * Contagem de leads por cidade (do visitante/produtor) nos últimos N dias.
 * Mostra onde a plataforma está gerando tração regional.
 */
async function getLeadsPorCidade({ daysBack = 30, limit = 20 } = {}) {
  const [rows] = await pool.query(
    `
    SELECT
      cidade,
      COUNT(*) AS total,
      SUM(CASE WHEN volume_range IN ('200_500', '500_mais') THEN 1 ELSE 0 END) AS alta_prioridade,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS fechados,
      AVG(first_response_seconds) AS sla_medio_segundos
    FROM corretora_leads
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND cidade IS NOT NULL
      AND cidade != ''
    GROUP BY cidade
    ORDER BY total DESC
    LIMIT ?
    `,
    [daysBack, limit],
  );

  return rows.map((r) => ({
    cidade: r.cidade,
    total: Number(r.total || 0),
    alta_prioridade: Number(r.alta_prioridade || 0),
    fechados: Number(r.fechados || 0),
    sla_medio_segundos: r.sla_medio_segundos
      ? Math.round(Number(r.sla_medio_segundos))
      : null,
  }));
}

/**
 * Ranking de corretoras por performance. Métricas-chave: leads
 * recebidos, fechados, SLA médio, taxa de conversão. Permite o admin
 * identificar quem está entregando resultado e quem precisa atenção.
 */
async function getCorretorasPerformance({ daysBack = 30, limit = 50 } = {}) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.slug,
      c.city,
      c.state,
      c.is_featured,
      c.status,
      COUNT(l.id) AS leads_total,
      SUM(CASE WHEN l.status = 'closed' THEN 1 ELSE 0 END) AS leads_fechados,
      SUM(CASE WHEN l.status = 'new' THEN 1 ELSE 0 END) AS leads_novos,
      SUM(CASE WHEN l.volume_range IN ('200_500', '500_mais') THEN 1 ELSE 0 END) AS leads_alta_prioridade,
      AVG(l.first_response_seconds) AS sla_medio_segundos,
      MAX(l.created_at) AS ultimo_lead_em
    FROM corretoras c
    LEFT JOIN corretora_leads l
      ON l.corretora_id = c.id
     AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    WHERE c.status IN ('active', 'inactive')
    GROUP BY c.id
    ORDER BY leads_total DESC, c.is_featured DESC, c.name ASC
    LIMIT ?
    `,
    [daysBack, limit],
  );

  return rows.map((r) => {
    const total = Number(r.leads_total || 0);
    const fechados = Number(r.leads_fechados || 0);
    const taxaConversao = total > 0 ? (fechados / total) * 100 : null;

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      state: r.state,
      is_featured: Boolean(r.is_featured),
      status: r.status,
      leads_total: total,
      leads_fechados: fechados,
      leads_novos: Number(r.leads_novos || 0),
      leads_alta_prioridade: Number(r.leads_alta_prioridade || 0),
      sla_medio_segundos: r.sla_medio_segundos
        ? Math.round(Number(r.sla_medio_segundos))
        : null,
      taxa_conversao_pct:
        taxaConversao !== null ? Math.round(taxaConversao * 10) / 10 : null,
      ultimo_lead_em: r.ultimo_lead_em,
    };
  });
}

/**
 * Lista de leads "pendurados" — sem resposta há X horas. Sinal
 * operacional para o admin proteger a marca e acionar corretora
 * lenta.
 */
async function getLeadsPendurados({ hoursBack = 24, limit = 50 } = {}) {
  const [rows] = await pool.query(
    `
    SELECT
      l.id,
      l.nome,
      l.cidade,
      l.volume_range,
      l.created_at,
      c.id AS corretora_id,
      c.name AS corretora_name,
      c.slug AS corretora_slug,
      c.city AS corretora_city,
      TIMESTAMPDIFF(HOUR, l.created_at, NOW()) AS horas_sem_resposta
    FROM corretora_leads l
    JOIN corretoras c ON c.id = l.corretora_id
    WHERE l.status = 'new'
      AND l.first_response_at IS NULL
      AND l.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
    ORDER BY l.created_at ASC
    LIMIT ?
    `,
    [hoursBack, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cidade: r.cidade,
    volume_range: r.volume_range,
    created_at: r.created_at,
    horas_sem_resposta: Number(r.horas_sem_resposta || 0),
    corretora: {
      id: r.corretora_id,
      name: r.corretora_name,
      slug: r.corretora_slug,
      city: r.corretora_city,
    },
  }));
}

/**
 * Foco em uma cidade específica (ex: Manhuaçu). Retorna KPIs
 * isolados da cidade para o admin tomar decisão localizada.
 */
async function getCidadeSnapshot(cidadeNome, { daysBack = 30 } = {}) {
  const [[snapshot]] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM corretoras
         WHERE status = 'active' AND LOWER(city) = LOWER(?)) AS corretoras_ativas,
      (SELECT COUNT(*) FROM corretora_leads
         WHERE LOWER(cidade) = LOWER(?)
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS leads_periodo,
      (SELECT COUNT(*) FROM corretora_leads
         WHERE LOWER(cidade) = LOWER(?)
           AND status = 'closed'
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS leads_fechados,
      (SELECT AVG(first_response_seconds) FROM corretora_leads
         WHERE LOWER(cidade) = LOWER(?)
           AND first_response_seconds IS NOT NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS sla_medio_segundos
    `,
    [cidadeNome, cidadeNome, daysBack, cidadeNome, daysBack, cidadeNome, daysBack],
  );

  return {
    cidade: cidadeNome,
    corretoras_ativas: Number(snapshot.corretoras_ativas || 0),
    leads_periodo: Number(snapshot.leads_periodo || 0),
    leads_fechados: Number(snapshot.leads_fechados || 0),
    sla_medio_segundos: snapshot.sla_medio_segundos
      ? Math.round(Number(snapshot.sla_medio_segundos))
      : null,
    days_back: daysBack,
  };
}

module.exports = {
  getRegionalKpis,
  getLeadsPorCidade,
  getCorretorasPerformance,
  getLeadsPendurados,
  getCidadeSnapshot,
};
