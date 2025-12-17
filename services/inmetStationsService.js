// services/inmetStationsService.js
// (Refatorado) Agora este service é o "GEOCODING" do Open-Meteo.
// Mantém o nome do arquivo para não quebrar imports antigos.

const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";

function normalizeUF(uf) {
  const s = String(uf || "").trim().toUpperCase();
  return s.length === 2 ? s : "";
}

function safeNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {}
  }, timeoutMs);

  try {
    const r = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "kavita-news/1.0",
      },
    });

    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, url, data };
  } catch (e) {
    return { ok: false, status: 0, url, data: { message: String(e?.message || e) } };
  } finally {
    clearTimeout(t);
  }
}

function mapResults(results, uf) {
  return (Array.isArray(results) ? results : [])
    .map((x) => {
      const lat = safeNum(x?.latitude);
      const lon = safeNum(x?.longitude);

      return {
        // compat (se algum lugar ainda espera "code")
        code: x?.id != null ? String(x.id) : undefined,

        name: String(x?.name || "").trim(),
        uf,

        lat,
        lon,

        country: x?.country ? String(x.country) : undefined,
        country_code: x?.country_code ? String(x.country_code) : undefined,
        admin1: x?.admin1 ? String(x.admin1) : undefined,
        admin2: x?.admin2 ? String(x.admin2) : undefined,
        timezone: x?.timezone ? String(x.timezone) : undefined,
      };
    })
    .filter((x) => x.name && x.uf && x.lat !== null && x.lon !== null);
}

/**
 * Sugestões de coordenadas para uma cidade/UF (Open-Meteo Geocoding)
 * @param {object} args
 * @param {string} args.uf - UF (2 letras)
 * @param {string} args.q - nome da cidade
 * @param {number} args.limit - limite (1..25)
 */
async function suggestStations({ uf, q, limit = 10 } = {}) {
  const UF = normalizeUF(uf);
  const Q = String(q || "").trim();

  if (!UF || Q.length < 2) return [];

  const lim = Math.min(25, Math.max(1, Number(limit) || 10));

  // 1) Tentativa principal: "Cidade, UF"
  const name1 = encodeURIComponent(`${Q}, ${UF}`);
  const url1 = `${GEO_BASE}?name=${name1}&count=${encodeURIComponent(lim)}&language=pt&country_code=BR`;
  const r1 = await fetchJson(url1);

  if (r1.ok && r1?.data?.results?.length) {
    return mapResults(r1.data.results, UF).slice(0, lim);
  }

  // 2) Fallback: só cidade (alguns nomes funcionam melhor assim)
  const name2 = encodeURIComponent(Q);
  const url2 = `${GEO_BASE}?name=${name2}&count=${encodeURIComponent(lim)}&language=pt&country_code=BR`;
  const r2 = await fetchJson(url2);

  if (r2.ok && r2?.data?.results?.length) {
    // ainda devolvemos uf como o UF solicitado (consistência do seu form)
    return mapResults(r2.data.results, UF).slice(0, lim);
  }

  return [];
}

module.exports = {
  suggestStations,
};
