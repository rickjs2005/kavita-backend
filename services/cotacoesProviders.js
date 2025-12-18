// services/cotacoesProviders.js
// Provider resolver para Kavita News - Cotações
// resolveProvider({ slug, group_key, row }) -> { ok, data? } | { ok:false, code, message, details? }

const PRESETS = {
  dolar: { name: "Dólar comercial", type: "cambio", unit: "R$", market: "BCB", source: "BCB PTAX" },

  "cafe-arabica": { name: "Café Arábica", type: "cafe", unit: "¢/lb", market: "ICE", source: "Stooq" },
  "cafe-robusta": { name: "Café Robusta", type: "cafe", unit: "USD/ton", market: "ICE", source: "Stooq" },

  soja: { name: "Soja", type: "graos", unit: "¢/bu", market: "CME", source: "Stooq" },
  milho: { name: "Milho", type: "graos", unit: "¢/bu", market: "CME", source: "Stooq" },

  "boi-gordo": { name: "Boi Gordo", type: "pecuaria", unit: "USD/cwt", market: "CME", source: "Stooq" },
};

function err(code, message, details) {
  return { ok: false, code, message, details: details || null };
}
function ok(data, meta) {
  const payload = { ok: true, data: data || {} };
  if (meta) payload.data.meta = meta;
  return payload;
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/plain,text/csv,*/*",
        "User-Agent": "Mozilla/5.0",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

/* =========================
 * BCB PTAX (robusto): usa período e pega o último registro disponível
 * ========================= */

function formatBcbDateMDY(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`; // MM-DD-YYYY
}

async function fetchBcbPtaxUsdBrl() {
  const base = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo";

  const today = new Date();
  const start = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);

  // ✅ CORREÇÃO: usar formatBcbDateMDY (e não formatBcbDateBR)
  const url =
    `${base}(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${formatBcbDateMDY(start)}'&@dataFinalCotacao='${formatBcbDateMDY(today)}'&$format=json`;

  const j = await fetchJson(url);
  const arr = Array.isArray(j?.value) ? j.value : [];
  if (!arr.length) throw new Error("BCB PTAX sem dados no período.");

  const last = arr[arr.length - 1];
  const sell = Number(last.cotacaoVenda ?? last.cotacaoCompra ?? NaN);
  if (!Number.isFinite(sell)) throw new Error("BCB PTAX sem cotacaoVenda/cotacaoCompra.");

  return {
    price: sell,
    variation_day: null,
    source: "BCB PTAX",
    observed_at: last.dataHoraCotacao || null,
    meta: { provider: "bcb-ptax-periodo", url },
  };
}

/* =========================
 * STOOQ (CSV) – histórico + fallback quote
 * ========================= */

function isBadText(raw) {
  if (!raw) return true;
  const s = String(raw).trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (low.includes("no data")) return true;
  if (s.startsWith("<!DOCTYPE") || s.startsWith("<html")) return true;
  return false;
}

// Histórico: Date,Open,High,Low,Close,Volume
function parseStooqHistoryLastClose(csvText) {
  const raw = String(csvText || "").trim();
  if (isBadText(raw)) return null;

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].toLowerCase().split(",");
  const idxDate = header.indexOf("date");
  const idxClose = header.indexOf("close");
  if (idxDate < 0 || idxClose < 0) return null;

  for (let i = lines.length - 1; i >= 1; i--) {
    const cols = lines[i].split(",");
    const date = cols[idxDate] || null;
    const close = Number(String(cols[idxClose] || "").replace(",", "."));
    if (date && Number.isFinite(close)) return { date, close };
  }
  return null;
}

// Quote: Symbol,Date,Time,Open,High,Low,Close,Volume (conforme f=sd2t2ohlcv)
function parseStooqQuoteClose(csvText) {
  const raw = String(csvText || "").trim();
  if (isBadText(raw)) return null;

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].toLowerCase().split(",");
  const idxDate = header.indexOf("date");
  const idxTime = header.indexOf("time");
  const idxClose = header.indexOf("close");

  if (idxClose < 0) return null;

  const row = lines[1].split(",");
  const date = idxDate >= 0 ? row[idxDate] : null;
  const time = idxTime >= 0 ? row[idxTime] : null;

  const close = Number(String(row[idxClose] || "").replace(",", "."));
  if (!Number.isFinite(close)) return null;

  const observed = date && time ? `${date} ${time}` : date || null;
  return { date: observed, close };
}

async function fetchStooqLast(symbol) {
  const urls = [
    // 1) histórico diário (último close)
    { kind: "history", url: `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d` },
    { kind: "history", url: `https://stooq.pl/q/d/l/?s=${encodeURIComponent(symbol)}&i=d` },

    // 2) fallback quote (muito mais estável em alguns símbolos)
    { kind: "quote", url: `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv` },
    { kind: "quote", url: `https://stooq.pl/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv` },
  ];

  let lastErr = null;

  for (const it of urls) {
    try {
      const csv = await fetchText(it.url);

      const parsed =
        it.kind === "history" ? parseStooqHistoryLastClose(csv) : parseStooqQuoteClose(csv);

      if (!parsed) throw new Error("CSV inválido/sem close");

      return {
        price: parsed.close,
        variation_day: null,
        source: `Stooq (${symbol})`,
        observed_at: parsed.date,
        meta: { provider: `stooq-${it.kind}`, symbol, url: it.url },
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Falha Stooq");
}

/* =========================
 * Resolver
 * ========================= */

async function resolveProvider({ slug, group_key, row }) {
  const preset = PRESETS[slug] || null;

  if (process.env.COTACOES_PROVIDER_ENABLED !== "true") {
    return err(
      "PROVIDER_DISABLED",
      "Provider de cotações desativado (COTACOES_PROVIDER_ENABLED=true para habilitar).",
      { slug, group_key, preset }
    );
  }

  try {
    switch (slug) {
      case "dolar": {
        const r = await fetchBcbPtaxUsdBrl();
        return ok(r, { preset });
      }

      case "cafe-arabica": {
        const r = await fetchStooqLast("KC.F");
        r.source = "Stooq (Coffee - ICE, proxy)";
        return ok(r, { preset });
      }

      case "soja": {
        const r = await fetchStooqLast("ZS.F");
        r.source = "Stooq (Soybean - CME, proxy)";
        return ok(r, { preset });
      }

      case "milho": {
        const r = await fetchStooqLast("ZC.F");
        r.source = "Stooq (Corn - CME, proxy)";
        return ok(r, { preset });
      }

      case "boi-gordo": {
        const r = await fetchStooqLast("LE.F");
        r.source = "Stooq (Live Cattle - CME, proxy)";
        return ok(r, { preset });
      }

      default:
        return err("UNKNOWN_SLUG", "Slug sem provider.", { slug, group_key, preset });
    }
  } catch (e) {
    return err("PROVIDER_ERROR", "Falha ao consultar provider.", {
      slug,
      group_key,
      preset,
      message: String(e?.message || e),
    });
  }
}

module.exports = { resolveProvider, PRESETS };
