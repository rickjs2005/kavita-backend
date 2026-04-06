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
const logger = require("../lib/logger");
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

/**
 * Calcula variação percentual do dia: ((novo - anterior) / anterior) * 100.
 * Retorna null se qualquer operando for inválido ou se prevPrice for zero.
 * Resultado arredondado a 4 casas decimais (ex: 2.3456 → "+2.3456%").
 */
function calcVariationDay(priceNow, prevPrice) {
  const nowN = toNumberOrNull(priceNow);
  const prevN = toNumberOrNull(prevPrice);
  if (nowN === null || prevN === null || prevN === 0) return null;
  return Number((((nowN - prevN) / prevN) * 100).toFixed(4));
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
    logger.error({ err: e, cotacao_id }, "[cotacoes] Falha ao inserir histórico (best-effort).");
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
 * Busca a taxa USD/BRL corrente via BCB PTAX.
 * Reutiliza a mesma função do provider de dólar.
 * @returns {Promise<number>} taxa de venda (ex: 5.72)
 */
async function fetchUsdBrlRate() {
  if (!cotacoesProviders || typeof cotacoesProviders.fetchBcbPtaxUsdBrl !== "function") {
    throw new Error("fetchBcbPtaxUsdBrl não disponível — provider não carregado.");
  }
  const result = await cotacoesProviders.fetchBcbPtaxUsdBrl();
  const rate = toNumberOrNull(result?.price);
  if (!rate || rate <= 0) throw new Error("Taxa USD/BRL inválida da BCB PTAX.");
  return rate;
}

/**
 * Converte preço do provider para BRL, quando necessário.
 * @param {number} rawPrice — preço bruto do provider
 * @param {object} preset — metadata do PRESET (currency, centsUnit)
 * @param {number|null} usdBrlRate — taxa USD/BRL (requerida se currency="USD")
 * @returns {{ priceBrl: number, originalPrice: number, originalCurrency: string, exchangeRate: number|null }}
 */
function convertToBrl(rawPrice, preset, usdBrlRate) {
  const currency = preset?.currency || "USD";
  const centsUnit = preset?.centsUnit === true;

  if (currency === "BRL") {
    return {
      priceBrl: rawPrice,
      originalPrice: rawPrice,
      originalCurrency: "BRL",
      exchangeRate: null,
    };
  }

  // USD-denominated: convert cents to dollars first if needed, then multiply by rate
  let priceUsd = rawPrice;
  if (centsUnit) {
    priceUsd = rawPrice / 100;
  }

  const priceBrl = Number((priceUsd * usdBrlRate).toFixed(4));

  return {
    priceBrl,
    originalPrice: rawPrice,
    originalCurrency: centsUnit ? "USD(¢)" : "USD",
    exchangeRate: usdBrlRate,
  };
}

/**
 * Sincroniza uma cotação com o provedor externo.
 * Converte preços em moeda estrangeira para BRL usando taxa BCB PTAX.
 * Atualiza o banco e grava histórico independentemente do resultado.
 *
 * @param {number} id      — PK da cotação
 * @param {object} row     — linha atual do banco (necessário para calcular variation_day)
 * @param {object} [opts]
 * @param {number} [opts.usdBrlRate] — taxa pré-buscada (evita N chamadas à BCB em syncAll)
 * @returns {{ updated: object, provider: object }}
 */
async function syncOne(id, row, { usdBrlRate: preloadedRate } = {}) {
  const resolved = await resolveCotacaoProvider(row);
  const now = nowSql();

  if (resolved?.ok) {
    const d = resolved.data || {};
    const rawPrice = toNumberOrNull(d.price);

    if (rawPrice === null) {
      logger.warn({ cotacaoId: id, slug: row?.slug }, "[cotacoes] Provider retornou price null.");
    }

    // Resolve preset for currency metadata
    const slug = String(row?.slug || "").trim();
    const preset = cotacoesProviders?.PRESETS?.[slug] || {};
    const needsConversion = preset.currency === "USD" && rawPrice !== null;

    let priceBrl = rawPrice;
    let originalPrice = rawPrice;
    let originalCurrency = preset.currency || null;
    let exchangeRate = null;
    let brlUnit = preset.brlUnit || row.unit || null;

    if (needsConversion) {
      try {
        const rate = preloadedRate || await fetchUsdBrlRate();
        const converted = convertToBrl(rawPrice, preset, rate);
        priceBrl = converted.priceBrl;
        originalPrice = converted.originalPrice;
        originalCurrency = converted.originalCurrency;
        exchangeRate = converted.exchangeRate;
      } catch (convErr) {
        // Conversion failed — mark as error, don't persist unconverted price
        const msg = normalizeSyncMessage(
          `Falha na conversão USD→BRL: ${convErr?.message || "taxa indisponível"}. Preço original: ${rawPrice} ${preset.unit || ""}.`
        );

        try {
          await cotacoesRepo.updateCotacao(id, {
            last_update_at: now,
            last_sync_status: "error",
            last_sync_message: msg,
          });
        } catch (e) {
          logger.error({ err: e, cotacaoId: id }, "[cotacoes] Falha ao atualizar status error.");
        }

        logger.warn({ cotacaoId: id, slug, err: convErr }, "[cotacoes] Conversão BRL falhou.");

        const updated = await cotacoesRepo.getCotacaoById(id);
        return {
          updated: updated || row,
          provider: { ok: false, code: "CONVERSION_ERROR", message: msg, details: { rawPrice, currency: preset.currency } },
        };
      }
    }

    const variation_day = calcVariationDay(priceBrl, row?.price);

    const patch = {
      price: priceBrl,
      original_price: originalPrice,
      original_currency: originalCurrency,
      exchange_rate: exchangeRate,
      unit: brlUnit,
      variation_day,
      source: d.source ? String(d.source).trim() : row.source || null,
      last_update_at: now,
      last_sync_status: "ok",
      last_sync_message: null,
    };

    await cotacoesRepo.updateCotacao(id, patch);

    await writeCotacaoHistorySafe({
      cotacao_id: id,
      price: priceBrl,
      variation_day,
      source: patch.source,
      observed_at: d.observed_at || now,
      sync_status: "ok",
      sync_message: null,
    });

    const updated = await cotacoesRepo.getCotacaoById(id);
    return {
      updated,
      provider: {
        ok: true,
        ...(d.meta ? d.meta : null),
        conversion: needsConversion ? { originalPrice, originalCurrency, exchangeRate, priceBrl } : null,
      },
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
    logger.error({ err: e, cotacaoId: id }, "[cotacoes] Falha ao atualizar status error no banco.");
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

  logger.warn(
    { cotacaoId: id, slug: row?.slug, code: resolved?.code, details: resolved?.details },
    "[cotacoes] Sync falhou para cotação."
  );

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
 * Busca a taxa USD/BRL uma única vez no início e reutiliza em todas as conversões.
 * @returns {{ total: number, ok: number, error: number, items: object[] }}
 */
async function syncAll() {
  const rows = await cotacoesRepo.listCotacoes();
  const ativos = Array.isArray(rows) ? rows.filter((r) => Number(r?.ativo ?? 1) === 1) : [];

  const summary = { total: ativos.length, ok: 0, error: 0, items: [] };

  // Pre-fetch USD/BRL rate once for all USD-denominated items.
  // If it fails, USD items will get individual CONVERSION_ERROR (non-blocking).
  let usdBrlRate = null;
  const hasUsdItems = ativos.some((r) => {
    const preset = cotacoesProviders?.PRESETS?.[String(r?.slug || "").trim()];
    return preset?.currency === "USD";
  });

  if (hasUsdItems) {
    try {
      usdBrlRate = await fetchUsdBrlRate();
      logger.info({ usdBrlRate }, "[cotacoes] Taxa USD/BRL obtida para sync-all.");
    } catch (e) {
      logger.warn({ err: e }, "[cotacoes] Falha ao obter taxa USD/BRL. Itens USD terão erro de conversão.");
    }
  }

  for (const row of ativos) {
    const id = Number(row?.id) || 0;
    if (!id) continue;

    try {
      const { provider } = await syncOne(id, row, { usdBrlRate });

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
        logger.warn({ cotacaoId: id, slug: row.slug, code: provider.code }, "[cotacoes] Sync-all: item falhou.");
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
      logger.error({ err: e, cotacaoId: id, slug: row.slug }, "[cotacoes] Sync-all: exceção ao sincronizar item.");
    }
  }

  return summary;
}

module.exports = { getMeta, syncOne, syncAll };
