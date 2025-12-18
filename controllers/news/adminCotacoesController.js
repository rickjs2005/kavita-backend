// controllers/news/adminCotacoesController.js
// Admin controller do Kavita News - COTAÇÕES (CRUD + validações + logs em admin_logs via pool)

const newsModel = require("../../models/newsModel");
const pool = require("../../config/pool");

let cotacoesProviders = null;
try {
  cotacoesProviders = require("../../services/cotacoesProviders");
} catch {
  cotacoesProviders = null;
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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/* =========================
 * Logs: grava direto em admin_logs
 * ========================= */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
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
 * Helpers de Sync Cotações
 * ========================================================= */

function normalizeSyncMessage(msg, max = 255) {
  if (!msg) return null;
  const s = String(msg).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolver MVP:
 * 1) Se existir services/cotacoesProviders exportando um resolver:
 *    - resolveProvider({ slug, group_key, row }) -> { ok, data?, error? }
 * 2) fallback simples (não implementado) => retorna ok:false
 */
async function resolveCotacaoProvider(row) {
  const slug = String(row?.slug || "").trim();
  const group_key = String(row?.group_key || "").trim();

  if (cotacoesProviders && typeof cotacoesProviders.resolveProvider === "function") {
    try {
      const r = await cotacoesProviders.resolveProvider({ slug, group_key, row });
      if (r && r.ok) return r;
      return {
        ok: false,
        code: r?.code || "PROVIDER_ERROR",
        message: r?.message || "Falha ao resolver provedor de cotação.",
        details: r?.details || null,
      };
    } catch (e) {
      return {
        ok: false,
        code: String(e?.code || "PROVIDER_EXCEPTION"),
        message: "Exceção ao consultar provedor de cotação.",
        details: { message: String(e?.message || e), slug, group_key },
      };
    }
  }

  return {
    ok: false,
    code: "PROVIDER_NOT_IMPLEMENTED",
    message: "Provider de cotações não implementado. Crie services/cotacoesProviders.js e exporte resolveProvider().",
    details: { slug, group_key },
  };
}

async function writeCotacaoHistorySafe({
  cotacao_id,
  price,
  variation_day,
  source,
  observed_at,
  sync_status,
  sync_message,
}) {
  try {
    if (typeof newsModel.insertCotacaoHistory !== "function") return;
    await newsModel.insertCotacaoHistory({
      cotacao_id,
      price,
      variation_day,
      source,
      observed_at,
      sync_status,
      sync_message,
    });
  } catch (e) {
    console.error("[COTACOES][HISTORY] falha ao inserir histórico:", e?.message || e);
  }
}

function calcVariationDay(priceNow, prevPrice) {
  const nowN = toNumberOrNull(priceNow);
  const prevN = toNumberOrNull(prevPrice);
  if (nowN === null || prevN === null) return null;
  return Number((nowN - prevN).toFixed(6));
}

/* =========================================================
 * Handlers - Cotações (news_cotacoes)
 * ========================================================= */

async function listCotacoes(req, res) {
  try {
    const rows = await newsModel.listCotacoes();
    return ok(res, rows);
  } catch (error) {
    console.error("adminCotacoesController.listCotacoes:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar cotações.");
  }
}

/**
 * GET /api/admin/news/cotacoes/meta
 * Retorna:
 * - allowed_slugs (whitelist)
 * - presets (para auto-preencher no frontend)
 * - suggestions (distinct no banco: markets/sources/units/types)
 */
async function getCotacoesMeta(req, res) {
  try {
    const suggestions =
      typeof newsModel.cotacoesMeta === "function"
        ? await newsModel.cotacoesMeta()
        : { markets: [], sources: [], units: [], types: [] };

    const presets = cotacoesProviders && cotacoesProviders.PRESETS ? cotacoesProviders.PRESETS : {};
    const allowed_slugs = Object.keys(presets || {});

    return ok(res, {
      allowed_slugs,
      presets,
      suggestions,
    });
  } catch (error) {
    console.error("adminCotacoesController.getCotacoesMeta:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao carregar meta de cotações.");
  }
}

async function createCotacao(req, res) {
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

    if (
      body.last_update_at !== undefined &&
      body.last_update_at !== null &&
      body.last_update_at !== "" &&
      !isValidDateTimeLike(body.last_update_at)
    ) {
      return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
    }

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
    console.error("adminCotacoesController.createCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar cotação.");
  }
}

async function updateCotacao(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (hasOwn(body, "name")) {
      if (body.name !== null && body.name !== "" && !isNonEmptyStr(body.name, 120))
        return fail(res, 400, "VALIDATION_ERROR", "name inválido (máx 120).", { field: "name" });
      patch.name = body.name ? String(body.name).trim() : null;
    }

    if (hasOwn(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug))
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = body.slug ? slug : null;
    }

    if (hasOwn(body, "type")) {
      if (body.type !== null && body.type !== "" && !isNonEmptyStr(body.type, 60))
        return fail(res, 400, "VALIDATION_ERROR", "type inválido (máx 60).", { field: "type" });
      patch.type = body.type ? String(body.type).trim() : null;
    }

    for (const f of ["price", "variation_day"]) {
      if (hasOwn(body, f)) {
        const n = toFloat(body[f]);
        if (body[f] !== null && body[f] !== "" && n === null) {
          return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (número).`, { field: f });
        }
        patch[f] = body[f] === "" ? null : n;
      }
    }

    for (const f of ["unit", "market", "source"]) {
      if (hasOwn(body, f)) {
        if (body[f] !== null && body[f] !== "" && !isOptionalStr(body[f], 120))
          return fail(res, 400, "VALIDATION_ERROR", `${f} inválido (máx 120).`, { field: f });
        patch[f] = body[f] ? String(body[f]).trim() : null;
      }
    }

    if (hasOwn(body, "last_update_at")) {
      if (body.last_update_at !== null && body.last_update_at !== "" && !isValidDateTimeLike(body.last_update_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      }
      patch.last_update_at = body.last_update_at ?? null;
    }

    if (hasOwn(body, "ativo")) patch.ativo = toBoolTiny(body.ativo, 1);

    const result = await newsModel.updateCotacao(id, patch);
    await logAdmin(req, "editou", "news_cotacoes", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.updateCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar cotação.");
  }
}

async function deleteCotacao(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");
    const result = await newsModel.deleteCotacao(id);
    await logAdmin(req, "removeu", "news_cotacoes", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.deleteCotacao:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao remover cotação.");
  }
}

/**
 * POST /api/admin/news/cotacoes/:id/sync
 */
async function syncCotacao(req, res) {
  const startedAt = new Date();
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const row = await newsModel.getCotacaoById(id);
    if (!row) return fail(res, 404, "NOT_FOUND", "Cotação não encontrada.");

    const resolved = await resolveCotacaoProvider(row);
    const now = nowSql();

    if (resolved?.ok) {
      const d = resolved.data || {};
      const price = toNumberOrNull(d.price);

      const variation_day = calcVariationDay(price, row?.price);

      const patch = {
        price,
        variation_day,
        source: d.source ? String(d.source).trim() : row.source || null,
        last_update_at: now,
        last_sync_status: "ok",
        last_sync_message: null,
      };

      await newsModel.updateCotacao(id, patch);

      await writeCotacaoHistorySafe({
        cotacao_id: id,
        price,
        variation_day,
        source: patch.source,
        observed_at: d.observed_at || now,
        sync_status: "ok",
        sync_message: null,
      });

      await logAdmin(req, "sincronizou", "news_cotacoes", id);

      const updated = await newsModel.getCotacaoById(id);
      return ok(res, updated, {
        provider: { ok: true, ...(d.meta ? d.meta : null) },
        took_ms: Date.now() - startedAt.getTime(),
      });
    }

    const msg = normalizeSyncMessage(resolved?.message || "Falha ao consultar provedor de cotação.");

    const patchErr = {
      last_update_at: now,
      last_sync_status: "error",
      last_sync_message: msg,
    };

    try {
      await newsModel.updateCotacao(id, patchErr);
    } catch (e) {
      console.error("[COTACOES][SYNC] falha ao atualizar status error:", e?.message || e);
    }

    await writeCotacaoHistorySafe({
      cotacao_id: id,
      price: row?.price ?? null,
      variation_day: row?.variation_day ?? null,
      source: row?.source ?? null,
      observed_at: now,
      sync_status: "error",
      sync_message: msg,
    });

    console.error("[COTACOES][SYNC] provider error:", resolved?.details || resolved);

    const updated = await newsModel.getCotacaoById(id);
    return ok(res, updated || row, {
      provider: {
        ok: false,
        code: resolved?.code || "PROVIDER_ERROR",
        message: msg,
        details: resolved?.details || null,
      },
      took_ms: Date.now() - startedAt.getTime(),
    });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacao:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao sincronizar cotação.");
  }
}

/**
 * POST /api/admin/news/cotacoes/sync-all
 */
async function syncCotacoesAll(req, res) {
  const startedAt = new Date();
  try {
    const rows = await newsModel.listCotacoes();

    const ativos = Array.isArray(rows) ? rows.filter((r) => Number(r?.ativo ?? 1) === 1) : [];

    const summary = {
      total: ativos.length,
      ok: 0,
      error: 0,
      items: [],
    };

    for (const row of ativos) {
      const id = toInt(row?.id, 0);
      if (!id) continue;

      try {
        const resolved = await resolveCotacaoProvider(row);
        const now = nowSql();

        if (resolved?.ok) {
          const d = resolved.data || {};
          const price = toNumberOrNull(d.price);

          const variation_day = calcVariationDay(price, row?.price);

          const patch = {
            price,
            variation_day,
            source: d.source ? String(d.source).trim() : row.source || null,
            last_update_at: now,
            last_sync_status: "ok",
            last_sync_message: null,
          };

          await newsModel.updateCotacao(id, patch);

          await writeCotacaoHistorySafe({
            cotacao_id: id,
            price,
            variation_day,
            source: patch.source,
            observed_at: d.observed_at || now,
            sync_status: "ok",
            sync_message: null,
          });

          summary.ok += 1;
          summary.items.push({ id, slug: row.slug, status: "ok" });
          continue;
        }

        const msg = normalizeSyncMessage(resolved?.message || "Falha ao consultar provedor de cotação.");

        await newsModel.updateCotacao(id, {
          last_update_at: now,
          last_sync_status: "error",
          last_sync_message: msg,
        });

        await writeCotacaoHistorySafe({
          cotacao_id: id,
          price: row?.price ?? null,
          variation_day: row?.variation_day ?? null,
          source: row?.source ?? null,
          observed_at: now,
          sync_status: "error",
          sync_message: msg,
        });

        summary.error += 1;
        summary.items.push({
          id,
          slug: row.slug,
          status: "error",
          message: msg,
          code: resolved?.code || "PROVIDER_ERROR",
        });

        console.error("[COTACOES][SYNC-ALL] provider error:", resolved?.details || resolved);
      } catch (e) {
        const msg = normalizeSyncMessage(e?.message || "Erro ao sincronizar item.");
        summary.error += 1;
        summary.items.push({
          id,
          slug: row.slug,
          status: "error",
          message: msg,
          code: String(e?.code || "ITEM_ERROR"),
        });
        console.error("[COTACOES][SYNC-ALL] item error:", e);
      }
    }

    await logAdmin(req, "sincronizou", "news_cotacoes", null);

    return ok(res, summary, { took_ms: Date.now() - startedAt.getTime() });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacoesAll:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao sincronizar cotações (all).");
  }
}

module.exports = {
  listCotacoes,
  createCotacao,
  updateCotacao,
  deleteCotacao,
  syncCotacao,
  syncCotacoesAll,
  getCotacoesMeta,
};
