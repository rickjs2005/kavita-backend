// controllers/news/adminClimaController.js
// Admin controller do Kavita News - CLIMA (CRUD + logs em admin_logs via pool)

const climaRepo = require("../../repositories/climaRepository");
const { logAdminAction } = require("../../services/adminLogs");
const {
  ok, created, fail,
  toInt, nowSql,
} = require("../../services/news/helpers");

/**
 * Sugestão de coordenadas (compatibilidade):
 * Mantivemos o nome do service por compatibilidade com o seu fluxo atual,
 * mas agora ele deve usar Open-Meteo Geocoding API (ver services/inmetStationsService.js).
 */
let inmetStationsService = null;
try {
  inmetStationsService = require("../../services/inmetStationsService");
} catch (e) {
  inmetStationsService = null;
  console.warn("[CLIMA] Falha ao carregar services/inmetStationsService:", e?.message || e);
}

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

/* helper local: extrai adminId do req e delega para o serviço centralizado */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  await logAdminAction({ adminId: getAdminId(req), acao, entidade, entidadeId: entidade_id });
}

/* =========================================================
 * ADMIN - CLIMA (news_clima)
 * ========================================================= */

/* =========================
 * Handlers - Clima
 * ========================= */

async function listClima(req, res) {
  try {
    const rows = await climaRepo.listClima();
    return ok(res, rows);
  } catch (error) {
    console.error("adminClimaController.listClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar clima.");
  }
}

/**
 * GET /api/admin/news/clima/stations?uf=MG&q=manhu&limit=10
 * Agora: sugestões via Open-Meteo Geocoding (mantém endpoint por compatibilidade).
 */
async function suggestClimaStations(req, res) {
  try {
    const uf = String(req.query.uf || "").trim().toUpperCase();
    const q = String(req.query.q || "").trim();
    const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));

    if (!uf || uf.length !== 2) {
      return res.status(400).json({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "UF inválida (use 2 letras)",
      });
    }

    if (!q || q.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    // 🔴 GARANTIA ABSOLUTA: chama SOMENTE o geocoding
    const data = await inmetStationsService.suggestStations({
      uf,
      q,
      limit,
    });

    return res.json({
      ok: true,
      data,
      meta: {
        provider: "OPEN_METEO_GEOCODING",
        uf,
        q,
        limit,
      },
    });
  } catch (err) {
    console.error("[CLIMA][GEOCODING]", err);
    return res.status(500).json({
      ok: false,
      code: "GEOCODING_ERROR",
      message: "Erro ao buscar coordenadas",
    });
  }
}

// req.body is pre-validated and coerced by validate(createClimaBodySchema)
async function createClima(req, res) {
  try {
    const row = await climaRepo.createClima(req.body);
    await logAdmin(req, "criou", "news_clima", row?.id ?? null);
    return created(res, row);
  } catch (error) {
    console.error("adminClimaController.createClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar clima.");
  }
}

// req.body is pre-validated and coerced by validate(updateClimaBodySchema)
// Only keys present in req.body are patched (the repo checks hasOwnProperty).
async function updateClima(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    if (Object.keys(req.body).length === 0) {
      return fail(res, 400, "VALIDATION_ERROR", "Nenhum campo para atualizar.");
    }

    const result = await climaRepo.updateClima(id, req.body);
    await logAdmin(req, "editou", "news_clima", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminClimaController.updateClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar clima.");
  }
}

async function deleteClima(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");
    const result = await climaRepo.deleteClima(id);
    await logAdmin(req, "removeu", "news_clima", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminClimaController.deleteClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover clima.");
  }
}

/* =========================================================
 * SYNC CLIMA (mm) - OPEN-METEO
 * ========================================================= */

async function fetchChuvaMmFromProvider(climaRow) {
  // ===== helpers =====
  const pad2 = (n) => String(n).padStart(2, "0");
  const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDays = (d, days) => {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    return x;
  };

  const fetchJson = async (url, timeoutMs = 15000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      try {
        ctrl.abort();
      } catch { }
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
  };

  const safeNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const sumArr = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return 0;
    let total = 0;
    for (const v of arr) total += safeNum(v) ?? 0;
    return Number(total.toFixed(2));
  };

  // ===== 1) coordenadas (preferência: já salvas no DB) =====
  let lat = safeNum(climaRow?.station_lat);
  let lon = safeNum(climaRow?.station_lon);

  // Se não tiver lat/lon, tenta geocoding pela cidade/UF
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
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=pt&country_code=BR`;
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

  // ===== 2) chuva (mm) via Open-Meteo daily precipitation_sum =====
  const now = new Date();
  const end = toYMD(now);
  const start7 = toYMD(addDays(now, -6)); // 7 dias (hoje + 6 anteriores)

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

async function syncClima(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const row = await climaRepo.getClimaById(id);
    if (!row) return fail(res, 404, "NOT_FOUND", "Registro de clima não encontrado.");

    let providerData = null;

    try {
      providerData = await fetchChuvaMmFromProvider(row);
    } catch (e) {
      // Agora: coordenadas ausentes => validação do cadastro
      if (String(e?.code || "") === "COORDS_REQUIRED") {
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Para sincronizar chuva com Open-Meteo, preencha station_lat e station_lon (ou mantenha city_name/uf válidos para geocoding).",
          e?.details || { field: ["station_lat", "station_lon"] }
        );
      }

      // Geocode falhou => continua sem quebrar o painel
      if (String(e?.code || "") === "GEOCODE_NOT_FOUND") {
        return ok(res, row, {
          provider: {
            ok: false,
            code: "GEOCODE_NOT_FOUND",
            message: "Geocoding não encontrou coordenadas para essa cidade/UF.",
            details: e?.details || null,
          },
        });
      }

      // erro do provedor => NÃO quebrar o painel
      console.error("syncClima.provider:", e?.details || e);
      return ok(res, row, {
        provider: {
          ok: false,
          code: String(e?.code || "PROVIDER_ERROR"),
          message: "Falha ao consultar provedor de clima.",
          details: e?.details || null,
        },
      });
    }

    const patch = {
      mm_24h: providerData.mm_24h ?? null,
      mm_7d: providerData.mm_7d ?? null,
      source: providerData.source || row.source || "UNKNOWN",
      last_update_at: nowSql(),
      last_sync_observed_at: nowSql(),
    };

    await climaRepo.updateClima(id, patch);
    await logAdmin(req, "sincronizou", "news_clima", id);

    const updated = await climaRepo.getClimaById(id);
    return ok(res, updated, providerData?.meta ? { provider: { ok: true, ...providerData.meta } } : undefined);
  } catch (error) {
    console.error("adminClimaController.syncClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao sincronizar clima.");
  }
}

module.exports = {
  listClima,
  suggestClimaStations,
  createClima,
  updateClima,
  deleteClima,
  syncClima,
};
