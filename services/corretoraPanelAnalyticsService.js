// services/corretoraPanelAnalyticsService.js
//
// Dashboard do PAINEL interno da corretora. Orquestra o repo
// tenant-scoped + calcula deltas vs período anterior (mesmo padrão
// de corretorasMetricsService do admin).
//
// Diferença essencial do admin:
//   - Todos os números são da própria corretora.
//   - Comparativo regional é AGREGADO ANÔNIMO da cidade (média + N),
//     sem expor outras corretoras.
"use strict";

const repo = require("../repositories/corretoraPanelAnalyticsRepository");

const ALLOWED_RANGES = { "7d": 7, "30d": 30, "90d": 90 };

function computeWindow(range) {
  const days = ALLOWED_RANGES[range] ?? 30;
  const now = new Date();
  const to = now;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, from, to, prevFrom, prevTo };
}

function pctDelta(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * Delta de SLA em segundos: positivo = piorou (ficou mais lento),
 * negativo = melhorou. UI trata a cor invertida (menos é melhor).
 */
function slaSecondsDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return curr - prev;
}

async function getDashboard(corretoraId, range = "30d") {
  const normalized = ALLOWED_RANGES[range] ? range : "30d";
  const { days, from, to, prevFrom, prevTo } = computeWindow(normalized);

  const [
    totalsCurr,
    totalsPrev,
    series,
    slaCurr,
    slaPrev,
    regional,
  ] = await Promise.all([
    repo.totals({ corretoraId, from, to }),
    repo.totals({ corretoraId, from: prevFrom, to: prevTo }),
    repo.leadsByDay({ corretoraId, from, to }),
    repo.slaStats({ corretoraId, from, to }),
    repo.slaStats({ corretoraId, from: prevFrom, to: prevTo }),
    repo.regionalComparison({ corretoraId, from, to }),
  ]);

  const closeRate =
    totalsCurr.leads > 0
      ? Math.round((totalsCurr.status_closed / totalsCurr.leads) * 100)
      : null;

  return {
    range: normalized,
    days,
    window: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      leads: totalsCurr.leads,
      leads_responded: totalsCurr.leads_responded,
      leads_under_1h: totalsCurr.leads_under_1h,
      leads_under_24h: totalsCurr.leads_under_24h,
      delta: {
        leads: pctDelta(totalsCurr.leads, totalsPrev.leads),
        leads_responded: pctDelta(
          totalsCurr.leads_responded,
          totalsPrev.leads_responded,
        ),
        leads_under_1h: pctDelta(
          totalsCurr.leads_under_1h,
          totalsPrev.leads_under_1h,
        ),
      },
    },
    rates: {
      response_rate:
        totalsCurr.leads > 0
          ? Math.round((totalsCurr.leads_responded / totalsCurr.leads) * 100)
          : null,
      under_1h_rate:
        totalsCurr.leads > 0
          ? Math.round((totalsCurr.leads_under_1h / totalsCurr.leads) * 100)
          : null,
      under_24h_rate:
        totalsCurr.leads > 0
          ? Math.round((totalsCurr.leads_under_24h / totalsCurr.leads) * 100)
          : null,
      close_rate: closeRate,
    },
    funnel: {
      new: totalsCurr.status_new,
      contacted: totalsCurr.status_contacted,
      closed: totalsCurr.status_closed,
      lost: totalsCurr.status_lost,
    },
    sla: {
      ...slaCurr,
      delta: {
        avg_seconds: slaSecondsDelta(
          slaCurr.avg_seconds,
          slaPrev.avg_seconds,
        ),
        p50_seconds: slaSecondsDelta(
          slaCurr.p50_seconds,
          slaPrev.p50_seconds,
        ),
      },
    },
    leadsByDay: series,
    regional,
  };
}

module.exports = { getDashboard, ALLOWED_RANGES };
