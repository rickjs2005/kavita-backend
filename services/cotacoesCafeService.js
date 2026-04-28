// services/cotacoesCafeService.js
//
// ETAPA 3.1 — preço indicativo da saca de café para mostrar como
// ticker na ficha pública da corretora (produtor rural decide por
// preço antes de qualquer outra coisa).
//
// DECISÕES IMPORTANTES:
//
// 1) NÃO inventa preço. Se a fonte falhar, retorna null — ticker
//    não aparece. Preferimos sumir do que mentir para o produtor.
//
// 2) Adapter pattern (igual corretoraPaymentService). Sem provider
//    configurado via COTACAO_CAFE_PROVIDER, o serviço retorna null
//    silenciosamente. Dá tempo pra cliente licenciar fonte real
//    (CEPEA paga, Notícias Agrícolas contrato, B3 etc.) antes de
//    ativar.
//
// 3) Cache in-memory 15min. Nunca bate na fonte mais do que 4x/hora
//    por provider. Se você quiser cache entre instâncias, plug Redis
//    depois (a função `getFromCache/setInCache` é a fronteira).
//
// 4) Timeout curto (5s) — se a fonte cair, não travamos a renderização
//    da ficha pública. Fail fast, retorna null.
//
// 5) Scraping de HTML público é frágil e pode violar ToS. Os adapters
//    de scraping ficam opcionais; o preferido é um provider que exponha
//    API real (CEPEA paga, Notícias Agrícolas B2B, um provedor próprio).
//    Aqui deixamos o CONTRATO pronto; o adapter concreto entra quando
//    o cliente escolher a fonte.
"use strict";

const logger = require("../lib/logger");

// Catálogo de adapters. Para plugar uma fonte, criar em
// services/cotacoes/<provider>Adapter.js com o shape:
//   { PROVIDER, isConfigured(), fetchArabicaPrice() → { price, variation_pct, as_of, source_url } }
const ADAPTERS = {};
try {
  // Dinamicamente registrados apenas se o arquivo existir.
   
  ADAPTERS.noticias_agricolas = require("./cotacoes/noticiasAgricolasAdapter");
} catch {
  // arquivo não existe — sem adapter concreto por padrão (OK)
}

function getDefaultAdapter() {
  const envChoice = (
    process.env.COTACAO_CAFE_PROVIDER || ""
  ).toLowerCase();
  if (!envChoice) return null;
  const adapter = ADAPTERS[envChoice];
  if (!adapter) return null;
  return adapter.isConfigured() ? adapter : null;
}

// ---------------------------------------------------------------------------
// Cache in-memory simples (TTL 15min). Chave por provider.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 15 * 60 * 1000;
const _cache = new Map();

function getFromCache(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}

function setInCache(key, value) {
  _cache.set(key, { value, at: Date.now() });
}

/**
 * Retorna a última cotação disponível do arábica. Shape:
 *   {
 *     price_cents: 180072,      // R$ 1.800,72/saca
 *     variation_pct: -1.22,     // variação %
 *     as_of: "2026-04-18",      // data da cotação (ISO ou YYYY-MM-DD)
 *     source: "noticias_agricolas",
 *     source_url: "https://..."  // link quando fonte permite
 *   }
 *
 * Retorna null se:
 *   - nenhum provider configurado
 *   - fonte falhou e cache expirou
 */
async function getArabicaSpot() {
  const adapter = getDefaultAdapter();
  if (!adapter) return null;

  const cacheKey = `arabica:${adapter.PROVIDER}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const result = await Promise.race([
      adapter.fetchArabicaPrice(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("cotacao.fetch_timeout")),
          5000,
        ),
      ),
    ]);
    if (!result || typeof result.price_cents !== "number") {
      return null;
    }
    const normalized = {
      price_cents: Math.round(result.price_cents),
      variation_pct:
        typeof result.variation_pct === "number"
          ? Number(result.variation_pct.toFixed(2))
          : null,
      as_of: result.as_of ?? null,
      source: adapter.PROVIDER,
      source_url: result.source_url ?? null,
    };
    setInCache(cacheKey, normalized);
    return normalized;
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err), provider: adapter.PROVIDER },
      "cotacoes.cafe.fetch_failed",
    );
    // Fallback silencioso — ticker some da UI até a próxima tentativa.
    return null;
  }
}

/**
 * Exposto principalmente pra testes — permite simular "fonte caiu"
 * limpando o cache entre cenários.
 */
function _clearCache() {
  _cache.clear();
}

module.exports = { getArabicaSpot, _clearCache };
