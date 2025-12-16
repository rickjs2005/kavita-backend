// controllers/adminNewsController.js
// Admin controller do Kavita News (CRUD + validações + logs em admin_logs via pool)

const newsModel = require("../models/newsModel");
const pool = require("../config/pool");

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
  const n = Number.parseFloat(String(v));
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

/* =========================
 * Logs: grava direto em admin_logs
 * ========================= */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = getAdminId(req);
    if (!admin_id) return;

    await pool.query(
      `INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)`,
      [admin_id, acao, entidade, entidade_id]
    );
  } catch {
    // log nunca pode derrubar a request
  }
}

/* =========================================================
 * ADMIN - CLIMA (news_clima)
 * ========================================================= */

exports.listClima = async (req, res) => {
  try {
    const rows = await newsModel.listClima();
    return ok(res, rows);
  } catch (error) {
    console.error("adminNewsController.listClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar clima.");
  }
};

exports.createClima = async (req, res) => {
  try {
    const body = req.body || {};

    const city_name = isNonEmptyStr(body.city_name, 120) ? body.city_name.trim() : null;
    const slug = normalizeSlug(body.slug);
    const uf = normalizeUF(body.uf);

    if (!city_name) return fail(res, 400, "VALIDATION_ERROR", "city_name é obrigatório (máx 120).", { field: "city_name" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (uf.length !== 2) return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });

    // IBGE
    let ibge_id = null;
    if (body.ibge_id !== undefined && body.ibge_id !== null && body.ibge_id !== "") {
      const n = toInt(body.ibge_id, 0);
      if (!n || n < 1) return fail(res, 400, "VALIDATION_ERROR", "ibge_id inválido (inteiro > 0).", { field: "ibge_id" });
      ibge_id = n;
    }

    // Estação
    let station_code = null;
    if (body.station_code !== undefined && body.station_code !== null && body.station_code !== "") {
      station_code = String(body.station_code).trim().toUpperCase();
      if (station_code.length > 10) return fail(res, 400, "VALIDATION_ERROR", "station_code inválido (máx 10).", { field: "station_code" });
      if (!/^[A-Z]\d{3}$/.test(station_code)) return fail(res, 400, "VALIDATION_ERROR", "station_code inválido (ex.: A827).", { field: "station_code" });
    }

    // mm
    const mm_24h = toFloat(body.mm_24h);
    const mm_7d = toFloat(body.mm_7d);
    if (body.mm_24h !== undefined && body.mm_24h !== null && body.mm_24h !== "" && mm_24h === null)
      return fail(res, 400, "VALIDATION_ERROR", "mm_24h inválido (deve ser número).", { field: "mm_24h" });
    if (body.mm_7d !== undefined && body.mm_7d !== null && body.mm_7d !== "" && mm_7d === null)
      return fail(res, 400, "VALIDATION_ERROR", "mm_7d inválido (deve ser número).", { field: "mm_7d" });

    // Datas
    const dateFields = ["last_update_at", "last_sync_observed_at", "last_sync_forecast_at"];
    for (const f of dateFields) {
      if (body[f] !== undefined && body[f] !== null && body[f] !== "") {
        if (!isValidDateTimeLike(body[f])) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (YYYY-MM-DD HH:mm:ss).`, { field: f });
      }
    }

    // Strings opcionais
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
    console.error("adminNewsController.createClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar clima.");
  }
};

exports.updateClima = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, "city_name")) {
      if (body.city_name !== null && body.city_name !== "" && !isNonEmptyStr(body.city_name, 120))
        return fail(res, 400, "VALIDATION_ERROR", "city_name inválido (máx 120).", { field: "city_name" });
      patch.city_name = body.city_name ? String(body.city_name).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug))
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = body.slug ? slug : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "uf")) {
      const uf = normalizeUF(body.uf);
      if (body.uf !== null && body.uf !== "" && uf.length !== 2)
        return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });
      patch.uf = body.uf ? uf : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ibge_id")) {
      if (body.ibge_id === null || body.ibge_id === "") patch.ibge_id = null;
      else {
        const n = toInt(body.ibge_id, 0);
        if (!n || n < 1) return fail(res, 400, "VALIDATION_ERROR", "ibge_id inválido (inteiro > 0).", { field: "ibge_id" });
        patch.ibge_id = n;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "station_code")) {
      if (body.station_code === null || body.station_code === "") patch.station_code = null;
      else {
        const sc = String(body.station_code).trim().toUpperCase();
        if (sc.length > 10) return fail(res, 400, "VALIDATION_ERROR", "station_code inválido (máx 10).", { field: "station_code" });
        if (!/^[A-Z]\d{3}$/.test(sc)) return fail(res, 400, "VALIDATION_ERROR", "station_code inválido (ex.: A827).", { field: "station_code" });
        patch.station_code = sc;
      }
    }

    const floatFields = ["station_lat", "station_lon", "station_distance", "mm_24h", "mm_7d"];
    for (const f of floatFields) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        const n = toFloat(body[f]);
        if (body[f] !== null && body[f] !== "" && n === null) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (número).`, { field: f });
        patch[f] = body[f] === "" ? null : n;
      }
    }

    const optStr120 = ["source", "station_name", "ibge_source", "station_source"];
    for (const f of optStr120) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        if (body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], 120)) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx 120).`, { field: f });
        patch[f] = body[f] ? String(body[f]).trim() : null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "station_uf")) {
      if (body.station_uf === null || body.station_uf === "") patch.station_uf = null;
      else {
        const uf = normalizeUF(body.station_uf);
        if (uf.length !== 2) return fail(res, 400, "VALIDATION_ERROR", "station_uf inválido (2 letras).", { field: "station_uf" });
        patch.station_uf = uf;
      }
    }

    const dateFields = ["last_update_at", "last_sync_observed_at", "last_sync_forecast_at"];
    for (const f of dateFields) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        if (body[f] !== null && body[f] !== "" && !isValidDateTimeLike(body[f])) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (YYYY-MM-DD HH:mm:ss).`, { field: f });
        patch[f] = body[f] ?? null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "ativo")) patch.ativo = toBoolTiny(body.ativo, 1);

    const result = await newsModel.updateClima(id, patch);
    await logAdmin(req, "editou", "news_clima", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updateClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar clima.");
  }
};

exports.deleteClima = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");
    const result = await newsModel.deleteClima(id);
    await logAdmin(req, "removeu", "news_clima", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.deleteClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover clima.");
  }
};

/* =========================================================
 * SYNC CLIMA (mm)
 * ========================================================= */

// Por enquanto, um "provider" plugável.
// Você troca esta função por INMET real depois, sem mexer em rotas/model/controller.
async function fetchChuvaMmFromProvider(climaRow) {
  if (!climaRow?.station_code) {
    const err = new Error("STATION_CODE_REQUIRED");
    err.code = "STATION_CODE_REQUIRED";
    throw err;
  }

  // MOCK para validar pipeline (admin -> backend -> DB -> admin)
  return {
    mm_24h: 0.0,
    mm_7d: 0.0,
    source: "PROVIDER_MOCK",
    observedAt: new Date(),
  };
}

exports.syncClima = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const row = await newsModel.getClimaById(id);
    if (!row) return fail(res, 404, "NOT_FOUND", "Registro de clima não encontrado.");

    let providerData;
    try {
      providerData = await fetchChuvaMmFromProvider(row);
    } catch (e) {
      if (String(e?.code || e?.message || "") === "STATION_CODE_REQUIRED") {
        return fail(res, 400, "VALIDATION_ERROR", "Para sincronizar chuva (mm), cadastre station_code (ex: A827).", {
          field: "station_code",
        });
      }
      console.error("syncClima.provider:", e);
      return fail(res, 502, "PROVIDER_ERROR", "Falha ao consultar provedor de clima.");
    }

    const at = providerData.observedAt instanceof Date ? providerData.observedAt : new Date();
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
    return ok(res, updated);
  } catch (error) {
    console.error("adminNewsController.syncClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao sincronizar clima.");
  }
};

/* =========================================================
 * ADMIN - COTAÇÕES (news_cotacoes)
 * ========================================================= */

exports.listCotacoes = async (req, res) => {
  try {
    const rows = await newsModel.listCotacoes();
    return ok(res, rows);
  } catch (error) {
    console.error("adminNewsController.listCotacoes:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar cotações.");
  }
};

exports.createCotacao = async (req, res) => {
  try {
    const body = req.body || {};

    const name = isNonEmptyStr(body.name, 120) ? body.name.trim() : null;
    const slug = normalizeSlug(body.slug);
    const type = isNonEmptyStr(body.type, 60) ? body.type.trim() : null;

    if (!name) return fail(res, 400, "VALIDATION_ERROR", "name é obrigatório (máx 120).", { field: "name" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (!type) return fail(res, 400, "VALIDATION_ERROR", "type é obrigatório (máx 60).", { field: "type" });

    const price = toFloat(body.price);
    const variation_day = toFloat(body.variation_day);

    if (body.price !== undefined && body.price !== null && body.price !== "" && price === null)
      return fail(res, 400, "VALIDATION_ERROR", "price inválido (número).", { field: "price" });

    if (body.variation_day !== undefined && body.variation_day !== null && body.variation_day !== "" && variation_day === null)
      return fail(res, 400, "VALIDATION_ERROR", "variation_day inválido (número).", { field: "variation_day" });

    const optStr120 = ["unit", "market", "source"];
    for (const f of optStr120) {
      if (body[f] !== undefined && body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], 120)) {
        return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx 120).`, { field: f });
      }
    }

    if (body.last_update_at !== undefined && body.last_update_at !== null && body.last_update_at !== "" && !isValidDateTimeLike(body.last_update_at))
      return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });

    const payload = {
      name,
      slug,
      type,
      price,
      unit: body.unit ? String(body.unit).trim() : null,
      variation_day,
      market: body.market ? String(body.market).trim() : null,
      source: body.source ? String(body.source).trim() : null,
      last_update_at: body.last_update_at ?? null,
      ativo: toBoolTiny(body.ativo, 1),
    };

    const row = await newsModel.createCotacao(payload);
    await logAdmin(req, "criou", "news_cotacoes", row?.id ?? null);
    return created(res, row);
  } catch (error) {
    console.error("adminNewsController.createCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar cotação.");
  }
};

exports.updateCotacao = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      if (body.name !== null && body.name !== "" && !isNonEmptyStr(body.name, 120))
        return fail(res, 400, "VALIDATION_ERROR", "name inválido (máx 120).", { field: "name" });
      patch.name = body.name ? String(body.name).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug))
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = body.slug ? slug : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "type")) {
      if (body.type !== null && body.type !== "" && !isNonEmptyStr(body.type, 60))
        return fail(res, 400, "VALIDATION_ERROR", "type inválido (máx 60).", { field: "type" });
      patch.type = body.type ? String(body.type).trim() : null;
    }

    const floatFields = ["price", "variation_day"];
    for (const f of floatFields) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        const n = toFloat(body[f]);
        if (body[f] !== null && body[f] !== "" && n === null) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (número).`, { field: f });
        patch[f] = body[f] === "" ? null : n;
      }
    }

    const optStr120 = ["unit", "market", "source"];
    for (const f of optStr120) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        if (body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], 120)) return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx 120).`, { field: f });
        patch[f] = body[f] ? String(body[f]).trim() : null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "last_update_at")) {
      if (body.last_update_at !== null && body.last_update_at !== "" && !isValidDateTimeLike(body.last_update_at))
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      patch.last_update_at = body.last_update_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ativo")) patch.ativo = toBoolTiny(body.ativo, 1);

    const result = await newsModel.updateCotacao(id, patch);
    await logAdmin(req, "editou", "news_cotacoes", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updateCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar cotação.");
  }
};

exports.deleteCotacao = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");
    const result = await newsModel.deleteCotacao(id);
    await logAdmin(req, "removeu", "news_cotacoes", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.deleteCotacao:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover cotação.");
  }
};

/* =========================================================
 * ADMIN - POSTS (news_posts)
 * ========================================================= */

exports.listPosts = async (req, res) => {
  try {
    const status = req.query?.status ? String(req.query.status).trim() : null;
    const search = req.query?.search ? String(req.query.search).trim() : null;
    const limit = Math.max(1, Math.min(200, toInt(req.query?.limit, 20)));
    const offset = Math.max(0, toInt(req.query?.offset, 0));

    const rows = await newsModel.listPosts({ status, search, limit, offset });
    return ok(res, rows, { status, search, limit, offset });
  } catch (error) {
    console.error("adminNewsController.listPosts:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar posts.");
  }
};

exports.createPost = async (req, res) => {
  try {
    const body = req.body || {};

    const title = isNonEmptyStr(body.title, 200) ? body.title.trim() : null;
    const slug = normalizeSlug(body.slug);
    const content = isNonEmptyStr(body.content, 1000000) ? String(body.content) : null;

    if (!title) return fail(res, 400, "VALIDATION_ERROR", "title é obrigatório (máx 200).", { field: "title" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (!content) return fail(res, 400, "VALIDATION_ERROR", "content é obrigatório.", { field: "content" });

    if (body.published_at !== undefined && body.published_at !== null && body.published_at !== "" && !isValidDateTimeLike(body.published_at))
      return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });

    const payload = {
      title,
      slug,
      excerpt: body.excerpt ? String(body.excerpt).trim() : null,
      content,
      cover_image_url: body.cover_image_url ? String(body.cover_image_url).trim() : null,
      category: body.category ? String(body.category).trim() : null,
      tags: body.tags ? String(body.tags).trim() : null,
      status: body.status ? String(body.status).trim() : "draft",
      published_at: body.published_at ?? null,
      author_admin_id: toInt(body.author_admin_id, getAdminId(req) || 0) || null,
      ativo: toBoolTiny(body.ativo, 1),
    };

    const row = await newsModel.createPost(payload);
    await logAdmin(req, "criou", "news_posts", row?.id ?? null);
    return created(res, row);
  } catch (error) {
    console.error("adminNewsController.createPost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar post.");
  }
};

exports.updatePost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      if (body.title !== null && body.title !== "" && !isNonEmptyStr(body.title, 200))
        return fail(res, 400, "VALIDATION_ERROR", "title inválido (máx 200).", { field: "title" });
      patch.title = body.title ? String(body.title).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug))
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = body.slug ? slug : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
      if (body.content !== null && body.content !== "" && !isNonEmptyStr(String(body.content), 1000000))
        return fail(res, 400, "VALIDATION_ERROR", "content inválido.", { field: "content" });
      patch.content = body.content ? String(body.content) : null;
    }

    const optStr = ["excerpt", "cover_image_url", "category", "tags", "status"];
    for (const f of optStr) {
      if (Object.prototype.hasOwnProperty.call(body, f)) patch[f] = body[f] ? String(body[f]).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "published_at")) {
      if (body.published_at !== null && body.published_at !== "" && !isValidDateTimeLike(body.published_at))
        return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
      patch.published_at = body.published_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "author_admin_id")) {
      patch.author_admin_id = body.author_admin_id === null || body.author_admin_id === "" ? null : toInt(body.author_admin_id, 0) || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ativo")) patch.ativo = toBoolTiny(body.ativo, 1);

    const result = await newsModel.updatePost(id, patch);
    await logAdmin(req, "editou", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updatePost:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar post.");
  }
};

exports.deletePost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");
    const result = await newsModel.deletePost(id);
    await logAdmin(req, "removeu", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.deletePost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover post.");
  }
};

exports.publishPost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const patch = {
      status: "published",
      published_at: nowSql(),
    };

    const result = await newsModel.updatePost(id, patch);
    await logAdmin(req, "publicou", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.publishPost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao publicar post.");
  }
};
