// controllers/news/adminClimaController.js
// Admin controller do Kavita News - CLIMA (CRUD + validações + logs em admin_logs via pool)

const newsModel = require("../../models/newsModel");
const pool = require("../../config/pool");
const ERROR_CODES = require("../../constants/ErrorCodes");

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

/* =========================
 * Helpers: respostas padronizadas
 * ========================= */
function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta) payload.meta = meta;
  return res.status(200).json(payload);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

function fail(res, status, code, message, details) {
  const payload = { ok: false, code, message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

function toInt(v, def = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? def : n;
}

function toFloat(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isNonEmptyStr(v, max = 999999) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function isOptionalStr(v, max) {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && v.trim().length <= max;
}

function normalizeUF(v) {
  return String(v || "").trim().toUpperCase();
}

function toBoolTiny(v, def = 1) {
  if (v === null || v === undefined || v === "") return def;
  if (v === true) return 1;
  if (v === false) return 0;

  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "sim" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "nao" || s === "não" || s === "no") return 0;

  const n = toInt(v, def);
  return n ? 1 : 0;
}

function isValidDateTimeLike(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s);
}

function nowSql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/* =========================
 * Logs: grava direto em admin_logs
 * ========================= */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = getAdminId(req);
    if (!admin_id) return;

    await pool.query(`INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)`, [
      admin_id,
      acao,
      entidade,
      entidade_id,
    ]);
  } catch {
    // log nunca pode derrubar a request
  }
}

/* =========================================================
 * ADMIN - CLIMA (news_clima)
 * ========================================================= */

function validateStationCodeOrNull(v, field = "station_code") {
  if (v === null || v === undefined || v === "") return { value: null };

  const sc = String(v).trim().toUpperCase();
  const isA3 = /^[A-Z]\d{3}$/.test(sc);
  const isNum = /^\d{4,7}$/.test(sc);

  if (!isA3 && !isNum) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: `${field} inválido (ex.: A827 ou 83692).`,
        details: { field },
      },
    };
  }
  if (sc.length > 10) {
    return {
      error: { status: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${field} inválido (máx 10).`, details: { field } },
    };
  }
  return { value: sc };
}

function validateOptionalFloat(body, field) {
  if (!hasOwn(body, field)) return { skip: true };
  const raw = body[field];
  const n = toFloat(raw);
  if (raw !== null && raw !== "" && raw !== undefined && n === null) {
    return { error: { status: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${field} inválido (número).`, details: { field } } };
  }
  return { value: raw === "" ? null : n };
}

function validateOptionalDateLike(body, field) {
  if (!hasOwn(body, field)) return { skip: true };
  const raw = body[field];
  if (raw !== null && raw !== "" && raw !== undefined && !isValidDateTimeLike(raw)) {
    return {
      error: { status: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${field} inválido (YYYY-MM-DD HH:mm:ss).`, details: { field } },
    };
  }
  return { value: raw ?? null };
}

function validateOptionalStrMax(body, field, max = 120) {
  if (!hasOwn(body, field)) return { skip: true };
  const raw = body[field];
  if (raw !== null && raw !== "" && raw !== undefined && !isOptionalStr(raw, max)) {
    return { error: { status: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${field} inválido (máx ${max}).`, details: { field } } };
  }
  return { value: raw ? String(raw).trim() : null };
}

function applyFail(res, f) {
  return fail(res, f.status, f.code, f.message, f.details);
}

/* =========================
 * Handlers - Clima
 * ========================= */

async function listClima(req, res) {
  try {
    const rows = await newsModel.listClima();
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

async function createClima(req, res) {
  try {
    const body = req.body || {};

    const city_name = isNonEmptyStr(body.city_name, 120) ? body.city_name.trim() : null;
    const slug = normalizeSlug(body.slug);
    const uf = normalizeUF(body.uf);

    if (!city_name) return fail(res, 400, "VALIDATION_ERROR", "city_name é obrigatório (máx 120).", { field: "city_name" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (uf.length !== 2) return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });

    let ibge_id = null;
    if (body.ibge_id !== undefined && body.ibge_id !== null && body.ibge_id !== "") {
      const n = toInt(body.ibge_id, 0);
      if (!n || n < 1) return fail(res, 400, "VALIDATION_ERROR", "ibge_id inválido (inteiro > 0).", { field: "ibge_id" });
      ibge_id = n;
    }

    const stationCodeRes = validateStationCodeOrNull(body.station_code, "station_code");
    if (stationCodeRes.error) return applyFail(res, stationCodeRes.error);
    const station_code = stationCodeRes.value;

    const mm_24h = toFloat(body.mm_24h);
    const mm_7d = toFloat(body.mm_7d);

    if (body.mm_24h !== undefined && body.mm_24h !== null && body.mm_24h !== "" && mm_24h === null)
      return fail(res, 400, "VALIDATION_ERROR", "mm_24h inválido (deve ser número).", { field: "mm_24h" });

    if (body.mm_7d !== undefined && body.mm_7d !== null && body.mm_7d !== "" && mm_7d === null)
      return fail(res, 400, "VALIDATION_ERROR", "mm_7d inválido (deve ser número).", { field: "mm_7d" });

    const dateFields = ["last_update_at", "last_sync_observed_at", "last_sync_forecast_at"];
    for (const f of dateFields) {
      if (body[f] !== undefined && body[f] !== null && body[f] !== "" && !isValidDateTimeLike(body[f])) {
        return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (YYYY-MM-DD HH:mm:ss).`, { field: f });
      }
    }

    const optStr120 = ["source", "station_name", "ibge_source", "station_source"];
    for (const f of optStr120) {
      if (body[f] !== undefined && body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], 120)) {
        return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx 120).`, { field: f });
      }
    }

    const payload = {
      city_name,
      slug,
      uf,
      ibge_id,
      station_code,
      station_name: body.station_name ? String(body.station_name).trim() : null,
      station_uf: body.station_uf ? normalizeUF(body.station_uf) : null,
      station_lat: toFloat(body.station_lat),
      station_lon: toFloat(body.station_lon),
      station_distance: toFloat(body.station_distance),
      ibge_source: body.ibge_source ? String(body.ibge_source).trim() : null,
      station_source: body.station_source ? String(body.station_source).trim() : null,
      last_sync_observed_at: body.last_sync_observed_at ?? null,
      last_sync_forecast_at: body.last_sync_forecast_at ?? null,
      mm_24h,
      mm_7d,
      source: body.source ? String(body.source).trim() : null,
      last_update_at: body.last_update_at ?? null,
      ativo: toBoolTiny(body.ativo, 1),
    };

    const row = await newsModel.createClima(payload);
    await logAdmin(req, "criou", "news_clima", row?.id ?? null);
    return created(res, row);
  } catch (error) {
    console.error("adminClimaController.createClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar clima.");
  }
}

async function updateClima(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (hasOwn(body, "city_name")) {
      if (body.city_name !== null && body.city_name !== "" && !isNonEmptyStr(body.city_name, 120))
        return fail(res, 400, "VALIDATION_ERROR", "city_name inválido (máx 120).", { field: "city_name" });
      patch.city_name = body.city_name ? String(body.city_name).trim() : null;
    }

    if (hasOwn(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug))
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = body.slug ? slug : null;
    }

    if (hasOwn(body, "uf")) {
      const uf = normalizeUF(body.uf);
      if (body.uf !== null && body.uf !== "" && uf.length !== 2)
        return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });
      patch.uf = body.uf ? uf : null;
    }

    if (hasOwn(body, "ibge_id")) {
      if (body.ibge_id === null || body.ibge_id === "") patch.ibge_id = null;
      else {
        const n = toInt(body.ibge_id, 0);
        if (!n || n < 1) return fail(res, 400, "VALIDATION_ERROR", "ibge_id inválido (inteiro > 0).", { field: "ibge_id" });
        patch.ibge_id = n;
      }
    }

    if (hasOwn(body, "station_code")) {
      const stationCodeRes = validateStationCodeOrNull(body.station_code, "station_code");
      if (stationCodeRes.error) return applyFail(res, stationCodeRes.error);
      patch.station_code = stationCodeRes.value;
    }

    for (const f of ["station_lat", "station_lon", "station_distance", "mm_24h", "mm_7d"]) {
      const r = validateOptionalFloat(body, f);
      if (r.error) return applyFail(res, r.error);
      if (!r.skip) patch[f] = r.value;
    }

    for (const f of ["source", "station_name", "ibge_source", "station_source"]) {
      const r = validateOptionalStrMax(body, f, 120);
      if (r.error) return applyFail(res, r.error);
      if (!r.skip) patch[f] = r.value;
    }

    if (hasOwn(body, "station_uf")) {
      if (body.station_uf === null || body.station_uf === "") patch.station_uf = null;
      else {
        const uf = normalizeUF(body.station_uf);
        if (uf.length !== 2) return fail(res, 400, "VALIDATION_ERROR", "station_uf inválido (2 letras).", { field: "station_uf" });
        patch.station_uf = uf;
      }
    }

    for (const f of ["last_update_at", "last_sync_observed_at", "last_sync_forecast_at"]) {
      const r = validateOptionalDateLike(body, f);
      if (r.error) return applyFail(res, r.error);
      if (!r.skip) patch[f] = r.value;
    }

    if (hasOwn(body, "ativo")) patch.ativo = toBoolTiny(body.ativo, 1);

    const result = await newsModel.updateClima(id, patch);
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
    const result = await newsModel.deleteClima(id);
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
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&daily=precipitation_sum` +
    `&timezone=America%2FSao_Paulo` +
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

    const row = await newsModel.getClimaById(id);
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

    await newsModel.updateClima(id, patch);
    await logAdmin(req, "sincronizou", "news_clima", id);

    const updated = await newsModel.getClimaById(id);
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
