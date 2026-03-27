// controllers/news/adminCotacoesController.js
// Admin controller do Kavita News - COTAÇÕES (CRUD + logs em admin_logs via pool)

const cotacoesRepo = require("../../repositories/cotacoesRepository");
const { logAdminAction } = require("../../services/adminLogs");
const { toInt, toBoolTiny, nowSql } = require("../../services/news/helpers");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

let cotacoesProviders = null;
try {
  cotacoesProviders = require("../../services/cotacoesProviders");
} catch {
  cotacoesProviders = null;
}

/* helper local: extrai adminId do req e delega para o serviço centralizado */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
  await logAdminAction({ adminId, acao, entidade, entidadeId: entidade_id });
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
    if (typeof cotacoesRepo.insertCotacaoHistory !== "function") return;
    await cotacoesRepo.insertCotacaoHistory({
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

async function listCotacoes(req, res, next) {
  try {
    const rows = await cotacoesRepo.listCotacoes();
    return response.ok(res, rows);
  } catch (error) {
    console.error("adminCotacoesController.listCotacoes:", error);
    return next(new AppError("Erro ao listar cotações.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * GET /api/admin/news/cotacoes/meta
 * Retorna:
 * - allowed_slugs (whitelist)
 * - presets (para auto-preencher no frontend)
 * - suggestions (distinct no banco: markets/sources/units/types)
 */
async function getCotacoesMeta(req, res, next) {
  try {
    const suggestions =
      typeof cotacoesRepo.cotacoesMeta === "function"
        ? await cotacoesRepo.cotacoesMeta()
        : { markets: [], sources: [], units: [], types: [] };

    const presets = cotacoesProviders && cotacoesProviders.PRESETS ? cotacoesProviders.PRESETS : {};
    const allowed_slugs = Object.keys(presets || {});

    return response.ok(res, {
      allowed_slugs,
      presets,
      suggestions,
    });
  } catch (error) {
    console.error("adminCotacoesController.getCotacoesMeta:", error);
    return next(new AppError("Erro ao carregar meta de cotações.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(createCotacaoBodySchema)
async function createCotacao(req, res, next) {
  try {
    const row = await cotacoesRepo.createCotacao(req.body);
    await logAdmin(req, "criou", "news_cotacoes", row?.id ?? null);
    return response.created(res, row);
  } catch (error) {
    console.error("adminCotacoesController.createCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return next(new AppError("Já existe uma cotação com esse slug.", "DUPLICATE", 409));
    return next(new AppError("Erro ao criar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(updateCotacaoBodySchema)
// Only keys present in req.body are patched (the repo checks hasOwnProperty).
async function updateCotacao(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", "VALIDATION_ERROR", 400));

    if (Object.keys(req.body).length === 0) {
      return next(new AppError("Nenhum campo para atualizar.", "VALIDATION_ERROR", 400));
    }

    const result = await cotacoesRepo.updateCotacao(id, req.body);
    await logAdmin(req, "editou", "news_cotacoes", id);
    return response.ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.updateCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY")) return next(new AppError("Já existe uma cotação com esse slug.", "DUPLICATE", 409));
    return next(new AppError("Erro ao atualizar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteCotacao(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", "VALIDATION_ERROR", 400));
    const result = await cotacoesRepo.deleteCotacao(id);
    await logAdmin(req, "removeu", "news_cotacoes", id);
    return response.ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.deleteCotacao:", error);
    return next(new AppError("Erro ao remover cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/cotacoes/:id/sync
 */
async function syncCotacao(req, res, next) {
  const startedAt = new Date();
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", "VALIDATION_ERROR", 400));

    const row = await cotacoesRepo.getCotacaoById(id);
    if (!row) return next(new AppError("Cotação não encontrada.", "NOT_FOUND", 404));

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

      await cotacoesRepo.updateCotacao(id, patch);

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

      const updated = await cotacoesRepo.getCotacaoById(id);
      return res.status(200).json({
        ok: true,
        data: updated,
        meta: {
          provider: { ok: true, ...(d.meta ? d.meta : null) },
          took_ms: Date.now() - startedAt.getTime(),
        },
      });
    }

    const msg = normalizeSyncMessage(resolved?.message || "Falha ao consultar provedor de cotação.");

    const patchErr = {
      last_update_at: now,
      last_sync_status: "error",
      last_sync_message: msg,
    };

    try {
      await cotacoesRepo.updateCotacao(id, patchErr);
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

    const updated = await cotacoesRepo.getCotacaoById(id);
    return res.status(200).json({
      ok: true,
      data: updated || row,
      meta: {
        provider: {
          ok: false,
          code: resolved?.code || "PROVIDER_ERROR",
          message: msg,
          details: resolved?.details || null,
        },
        took_ms: Date.now() - startedAt.getTime(),
      },
    });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacao:", error);
    return next(new AppError("Erro ao sincronizar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/cotacoes/sync-all
 */
async function syncCotacoesAll(req, res, next) {
  const startedAt = new Date();
  try {
    const rows = await cotacoesRepo.listCotacoes();

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

          await cotacoesRepo.updateCotacao(id, patch);

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

        await cotacoesRepo.updateCotacao(id, {
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

    return res.status(200).json({
      ok: true,
      data: summary,
      meta: { took_ms: Date.now() - startedAt.getTime() },
    });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacoesAll:", error);
    return next(new AppError("Erro ao sincronizar cotações (all).", ERROR_CODES.SERVER_ERROR, 500));
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
