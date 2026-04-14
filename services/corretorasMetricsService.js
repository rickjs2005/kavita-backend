"use strict";

// services/corretorasMetricsService.js
//
// Orquestra queries do repository em paralelo e computa o delta vs período
// anterior (padrão Stripe/Mixpanel: "+X% vs last 30d").

const repo = require("../repositories/corretorasMetricsRepository");

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
  if (prev === 0) return curr === 0 ? 0 : null; // n/a: anterior era 0
  return Math.round(((curr - prev) / prev) * 100);
}

async function getDashboard(range = "30d") {
  const normalized = ALLOWED_RANGES[range] ? range : "30d";
  const { days, from, to, prevFrom, prevTo } = computeWindow(normalized);

  const [
    totalsCurr,
    totalsPrev,
    series,
    byCity,
    sla,
    plans,
  ] = await Promise.all([
    repo.totals({ from, to }),
    repo.totals({ from: prevFrom, to: prevTo }),
    repo.leadsByDay({ from, to }),
    repo.leadsByCity({ from, to, limit: 10 }),
    repo.slaStats({ from, to }),
    repo.planDistribution(),
  ]);

  return {
    range: normalized,
    days,
    window: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      ...totalsCurr,
      delta: {
        leads: pctDelta(totalsCurr.leads, totalsPrev.leads),
        leads_responded: pctDelta(totalsCurr.leads_responded, totalsPrev.leads_responded),
        leads_under_1h: pctDelta(totalsCurr.leads_under_1h, totalsPrev.leads_under_1h),
        reviews_approved: pctDelta(totalsCurr.reviews_approved, totalsPrev.reviews_approved),
      },
    },
    rates: {
      response_rate: totalsCurr.leads > 0
        ? Math.round((totalsCurr.leads_responded / totalsCurr.leads) * 100)
        : null,
      under_1h_rate: totalsCurr.leads > 0
        ? Math.round((totalsCurr.leads_under_1h / totalsCurr.leads) * 100)
        : null,
      under_24h_rate: totalsCurr.leads > 0
        ? Math.round((totalsCurr.leads_under_24h / totalsCurr.leads) * 100)
        : null,
    },
    sla,
    leadsByDay: series,
    leadsByCity: byCity,
    plans,
  };
}

module.exports = { getDashboard, ALLOWED_RANGES };
