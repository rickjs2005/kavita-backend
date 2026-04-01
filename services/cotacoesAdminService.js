// services/cotacoesAdminService.js
//
// Lógica de domínio para sincronização e meta de cotações.
// Usado por: controllers/news/adminCotacoesController.js
//
// Responsabilidades:
//   getMeta()        — presets + suggestions para o painel admin
//   syncOne(id, row) — sincroniza uma cotação com o provedor externo
//   syncAll()        — itera todas as cotações ativas e chama syncOne

const cotacoesRepo = require("../repositories/cotacoesRepository");
const { nowSql } = require("./news/newsHelpers");

let cotacoesProviders = null;
try {
  cotacoesProviders = require("./cotacoesProviders");
} catch {
  cotacoesProviders = null;
}

/* =========================================================
 * Helpers privados
 * ========================================================= */

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeSyncMessage(msg, max = 255) {
  if (!msg) return null;
  const s = String(msg).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function calcVariationDay(priceNow, prevPrice) {
  const nowN = toNumberOrNull(priceNow);
  const prevN = toNumberOrNull(prevPrice);
  if (nowN === null || prevN === null) return null;
  return Number((nowN - prevN).toFixed(6));
}

/**
 * Resolver MVP:
 * 1) Se existir services/cotacoesProviders exportando resolveProvider:
 *    resolveProvider({ slug, group_key, row }) → { ok, data?, error? }
 * 2) fallback → ok:false (provider não implementado)
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
    message:
      "Provider de cotações não implementado. Crie services/cotacoesProviders.js e exporte resolveProvider().",
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

/* =========================================================
 * API pública
 * ========================================================= */

/**
 * Retorna presets, allowed_slugs e suggestions do banco para o painel admin.
 * @returns {{ allowed_slugs: string[], presets: object, suggestions: object }}
 */
async function getMeta() {
  const suggestions =
    typeof cotacoesRepo.cotacoesMeta === "function"
      ? await cotacoesRepo.cotacoesMeta()
      : { markets: [], sources: [], units: [], types: [] };

  const presets = cotacoesProviders?.PRESETS ?? {};
  const allowed_slugs = Object.keys(presets);

  return { allowed_slugs, presets, suggestions };
}

/**
 * Sincroniza uma cotação com o provedor externo.
 * Atualiza o banco e grava histórico independentemente do resultado.
 *
 * @param {number} id      — PK da cotação
 * @param {object} row     — linha atual do banco (necessário para calcular variation_day)
 * @returns {{ updated: object, provider: object }}
 *   updated  — linha do banco após o patch (ou row original em caso de erro grave)
 *   provider — { ok: true, ...meta } | { ok: false, code, message, details }
 */
async function syncOne(id, row) {
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

    const updated = await cotacoesRepo.getCotacaoById(id);
    return {
      updated,
      provider: { ok: true, ...(d.meta ? d.meta : null) },
    };
  }

  const msg = normalizeSyncMessage(
    resolved?.message || "Falha ao consultar provedor de cotação."
  );

  try {
    await cotacoesRepo.updateCotacao(id, {
      last_update_at: now,
      last_sync_status: "error",
      last_sync_message: msg,
    });
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
  return {
    updated: updated || row,
    provider: {
      ok: false,
      code: resolved?.code || "PROVIDER_ERROR",
      message: msg,
      details: resolved?.details || null,
    },
  };
}

/**
 * Sincroniza todas as cotações com ativo=1.
 * @returns {{ total: number, ok: number, error: number, items: object[] }}
 */
async function syncAll() {
  const rows = await cotacoesRepo.listCotacoes();
  const ativos = Array.isArray(rows) ? rows.filter((r) => Number(r?.ativo ?? 1) === 1) : [];

  const summary = { total: ativos.length, ok: 0, error: 0, items: [] };

  for (const row of ativos) {
    const id = Number(row?.id) || 0;
    if (!id) continue;

    try {
      const { provider } = await syncOne(id, row);

      if (provider.ok) {
        summary.ok += 1;
        summary.items.push({ id, slug: row.slug, status: "ok" });
      } else {
        summary.error += 1;
        summary.items.push({
          id,
          slug: row.slug,
          status: "error",
          message: provider.message,
          code: provider.code || "PROVIDER_ERROR",
        });
        console.error("[COTACOES][SYNC-ALL] provider error:", provider.details || provider);
      }
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

  return summary;
}

module.exports = { getMeta, syncOne, syncAll };
