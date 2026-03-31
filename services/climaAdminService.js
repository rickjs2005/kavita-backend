// services/climaAdminService.js
//
// Integração com Open-Meteo para sincronização de dados de chuva (mm).
// Usado por: controllers/news/adminClimaController.js
//
// Responsabilidade única: fetchRainData(climaRow)
//   - resolve coordenadas (DB ou geocoding)
//   - consulta Open-Meteo precipitation_sum
//   - retorna { mm_24h, mm_7d, source, observedAt, meta }
//
// Errors lançados (com .code e .details) para o controller tratar:
//   COORDS_REQUIRED   — sem lat/lon e sem city_name/uf válidos
//   GEOCODE_NOT_FOUND — geocoding não retornou resultado
//   PROVIDER_ERROR    — Open-Meteo retornou status != 2xx

/* ---- helpers privados ---- */

const pad2 = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, days) => {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
};

function safeNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function sumArr(arr) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  let total = 0;
  for (const v of arr) total += safeNum(v) ?? 0;
  return Number(total.toFixed(2));
}

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try { ctrl.abort(); } catch { }
  }, timeoutMs);

  try {
    const r = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "kavita-news/1.0" },
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, url, data };
  } catch (e) {
    return { ok: false, status: 0, url, data: { message: String(e?.message || e) } };
  } finally {
    clearTimeout(t);
  }
}

/* ---- API pública ---- */

/**
 * Consulta o provedor Open-Meteo e retorna dados de precipitação.
 *
 * Fluxo:
 *   1. Usa station_lat/station_lon do DB se disponíveis.
 *   2. Caso contrário, geocodifica city_name + uf via Open-Meteo Geocoding.
 *   3. Consulta precipitation_sum dos últimos 7 dias (janela today-6..today).
 *
 * @param {object} climaRow — linha atual do banco (news_clima)
 * @returns {{ mm_24h: number, mm_7d: number, source: string, observedAt: Date, meta: object }}
 * @throws {Error} com .code in ["COORDS_REQUIRED", "GEOCODE_NOT_FOUND", "PROVIDER_ERROR"]
 */
async function fetchRainData(climaRow) {
  // 1) coordenadas (preferência: já salvas no DB)
  let lat = safeNum(climaRow?.station_lat);
  let lon = safeNum(climaRow?.station_lon);

  if (lat === null || lon === null) {
    const city = String(climaRow?.city_name || "").trim();
    const uf = String(climaRow?.uf || "").trim().toUpperCase();

    if (!city || uf.length !== 2) {
      const err = new Error("COORDS_REQUIRED");
      err.code = "COORDS_REQUIRED";
      err.details = { need: ["station_lat", "station_lon"], have: { city, uf } };
      throw err;
    }

    const q = encodeURIComponent(`${city}, ${uf}`);
    const geoUrl =
      `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=pt&country_code=BR`;
    const geo = await fetchJson(geoUrl);

    const first = geo?.data?.results?.[0];
    lat = safeNum(first?.latitude);
    lon = safeNum(first?.longitude);

    if (lat === null || lon === null) {
      const err = new Error("GEOCODE_NOT_FOUND");
      err.code = "GEOCODE_NOT_FOUND";
      err.details = { city, uf, geoStatus: geo?.status, geoUrl, geoResponse: geo?.data };
      throw err;
    }
  }

  // 2) chuva (mm) via Open-Meteo daily precipitation_sum
  const now = new Date();
  const end = toYMD(now);
  const start7 = toYMD(addDays(now, -6)); // 7 dias: hoje + 6 anteriores

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    "&daily=precipitation_sum" +
    "&timezone=America%2FSao_Paulo" +
    `&start_date=${encodeURIComponent(start7)}` +
    `&end_date=${encodeURIComponent(end)}`;

  const r = await fetchJson(url);

  if (!r.ok) {
    const err = new Error("PROVIDER_ERROR");
    err.code = "PROVIDER_ERROR";
    err.details = { provider: "OPEN_METEO", status: r.status, url: r.url, response: r.data };
    throw err;
  }

  const daily = r?.data?.daily;
  const arr = Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum : [];

  const mm_24h = safeNum(arr?.[arr.length - 1]) ?? 0.0;
  const mm_7d = sumArr(arr);

  return {
    mm_24h,
    mm_7d,
    source: "OPEN_METEO",
    observedAt: now,
    meta: {
      provider: "OPEN_METEO",
      coords: { lat, lon },
      window: { start7, end },
      url,
    },
  };
}

module.exports = { fetchRainData };
