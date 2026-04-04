"use strict";

// services/climaSyncService.js
//
// Sincronização em batch de dados de chuva para todas as cidades ativas.
// Reutiliza climaAdminService.fetchRainData() para cada cidade.
//
// Responsabilidade: iterar cidades, chamar provedor, persistir, reportar.
// Scheduler: jobs/climaSyncJob.js

const climaRepo = require("../repositories/climaRepository");
const { fetchRainData } = require("./climaAdminService");

const DELAY_MS = Number(process.env.CLIMA_SYNC_DELAY_MS) || 1500;

const pad2 = (n) => String(n).padStart(2, "0");
function nowSql() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sincroniza uma única cidade. Retorna resultado para log.
 *
 * @param {object} row — linha news_clima do banco
 * @returns {{ id, city_name, ok, mm_24h?, mm_7d?, error? }}
 */
async function syncOne(row) {
  try {
    const data = await fetchRainData(row);

    const patch = {
      mm_24h: data.mm_24h ?? null,
      mm_7d: data.mm_7d ?? null,
      source: data.source || row.source || "UNKNOWN",
      last_update_at: nowSql(),
      last_sync_observed_at: nowSql(),
    };

    await climaRepo.updateClima(row.id, patch);

    return {
      id: row.id,
      city_name: row.city_name,
      ok: true,
      mm_24h: data.mm_24h,
      mm_7d: data.mm_7d,
    };
  } catch (err) {
    return {
      id: row.id,
      city_name: row.city_name,
      ok: false,
      error: err?.code || err?.message || "UNKNOWN_ERROR",
    };
  }
}

/**
 * Sincroniza todas as cidades ativas. Processa sequencialmente com delay
 * entre requisicoes para nao sobrecarregar o provedor (Open-Meteo free tier).
 *
 * @returns {{ total, success, failed, durationMs, results }}
 */
async function syncAll() {
  const start = Date.now();
  const cities = await climaRepo.listClimaPublic();

  if (!cities.length) {
    return { total: 0, success: 0, failed: 0, durationMs: 0, results: [] };
  }

  const results = [];

  for (let i = 0; i < cities.length; i++) {
    const result = await syncOne(cities[i]);
    results.push(result);

    // Delay entre requisicoes (exceto apos a ultima)
    if (i < cities.length - 1 && DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return {
    total: cities.length,
    success,
    failed,
    durationMs: Date.now() - start,
    results,
  };
}

module.exports = { syncAll, syncOne };
