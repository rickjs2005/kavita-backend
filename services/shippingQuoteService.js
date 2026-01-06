// services/shippingQuoteService.js
const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/* ------------------------------------------------------------------ */
/*                               Helpers                              */
/* ------------------------------------------------------------------ */

function parseCep(raw) {
  return String(raw || "").replace(/\D/g, "").slice(0, 8);
}

/**
 * Normaliza itens de entrada (aceita formatos comuns do frontend).
 * Saída: [{ id: number, quantidade: number }]
 */
function normalizeItems(raw) {
  if (!raw) return null;

  // Se vier string JSON (como no /quote?items=...)
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return normalizeItems(parsed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(raw)) return null;

  const normalized = raw
    .map((it) => {
      const id = Number(it?.id ?? it?.productId ?? it?.produtoId);
      const quantidade = Number(it?.quantidade ?? it?.qty ?? it?.quantity);
      return { id, quantidade };
    })
    .filter(
      (it) =>
        Number.isFinite(it.id) &&
        it.id > 0 &&
        Number.isFinite(it.quantidade) &&
        it.quantidade > 0
    );

  return normalized.length ? normalized : null;
}

/**
 * ViaCEP com fetch (Node 18+)
 * Retorna { state, city } ou null
 */
async function lookupCep(cep) {
  try {
    const url = `https://viacep.com.br/ws/${cep}/json/`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.erro) return null;

    return {
      state: String(data.uf || "").toUpperCase(),
      city: String(data.localidade || "").trim(),
    };
  } catch {
    return null;
  }
}

function normCity(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Regra: item qualifica para frete grátis por produto?
 * - shipping_free = 1
 * - e (shipping_free_from_qty é NULL) => sempre
 *   ou quantidade >= shipping_free_from_qty => grátis
 *
 * Observação: manter a semântica do admin:
 * - NULL => grátis para qualquer quantidade
 * - 0 ou <=0 => também tratamos como "sempre grátis" (defensivo)
 */
function qualifiesProductFree({ shipping_free, shipping_free_from_qty }, quantidade) {
  if (Number(shipping_free) !== 1) return { ok: false, reason: null };

  const fromQty =
    shipping_free_from_qty === null || shipping_free_from_qty === undefined
      ? null
      : Number(shipping_free_from_qty);

  // NULL ou 0/negativo => sempre grátis
  if (fromQty == null || !Number.isFinite(fromQty) || fromQty <= 0) {
    return { ok: true, reason: "ALWAYS" };
  }

  if (Number(quantidade) >= fromQty) {
    return { ok: true, reason: `FROM_QTY_${fromQty}` };
  }

  return { ok: false, reason: null };
}

/* ------------------------------------------------------------------ */
/*                               Service                              */
/* ------------------------------------------------------------------ */

/**
 * Prioridade correta:
 * 1) Regra do produto (frete grátis por produto / a partir de X unidades)
 * 2) Zona
 * 3) Faixa de CEP (fallback)
 *
 * getQuote({ cep, items })
 * - cep: string (pode vir com máscara; será sanitizado)
 * - items: array [{id, quantidade}] ou string JSON (será normalizado)
 *
 * Retorna:
 * { cep, price, prazo_dias, is_free, ruleApplied, freeItems, zone }
 */
async function getQuote({ cep: rawCep, items: rawItems }) {
  const cep = parseCep(rawCep);
  const items = normalizeItems(rawItems);

  if (!cep || cep.length !== 8) {
    throw new AppError(
      "CEP inválido. Informe 8 dígitos.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  if (!items || items.length === 0) {
    throw new AppError(
      "Carrinho vazio para cálculo de frete.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  // ------------------------------------------------------------
  // 1) REGRA DO PRODUTO (avaliar primeiro)
  // ------------------------------------------------------------
  const uniqueIds = Array.from(new Set(items.map((i) => i.id)));

  const [products] = await pool.query(
    `
      SELECT id, shipping_free, shipping_free_from_qty
      FROM products
      WHERE id IN (?)
    `,
    [uniqueIds]
  );

  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  const missing = uniqueIds.filter((id) => !byId.has(Number(id)));

  if (missing.length) {
    throw new AppError(
      `Produtos inválidos no carrinho (ids não encontrados): ${missing.join(", ")}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  // freeItems: lista dos itens que QUALIFICAM (útil para UI/debug)
  const freeItems = [];
  let productFree = false;

  for (const it of items) {
    const p = byId.get(Number(it.id));
    const q = Number(it.quantidade);

    const qual = qualifiesProductFree(p, q);

    if (qual.ok) {
      productFree = true;
      freeItems.push({ id: Number(it.id), quantidade: q, reason: qual.reason });
    }
  }

  // ------------------------------------------------------------
  // 2) ZONA (precisa de UF/cidade via CEP)
  // ------------------------------------------------------------
  const place = await lookupCep(cep);
  if (!place || !place.state) {
    throw new AppError(
      "Não foi possível identificar UF/cidade do CEP.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  // Vamos calcular uma "baseQuote" por ZONA e, se não tiver, por FAIXA CEP.
  // Isso mantém prazo/zone consistente mesmo quando o price final vira 0 por regra do produto.
  let baseQuote = null;

  // ------------------------------------------------------------
  // 2.1) Tenta aplicar zona ativa (UF + cidade)
  // ------------------------------------------------------------
  const [zones] = await pool.query(
    `
      SELECT z.id, z.name, z.state, z.all_cities, z.is_free, z.price, z.prazo_dias
      FROM shipping_zones z
      WHERE z.is_active = 1 AND z.state = ?
      ORDER BY z.all_cities ASC, z.id DESC
    `,
    [place.state]
  );

  if (zones && zones.length) {
    const cityLower = normCity(place.city);

    // zona específica por cidade
    for (const z of zones) {
      if (Number(z.all_cities) === 1) continue;

      const [rowsCity] = await pool.query(
        `SELECT 1 FROM shipping_zone_cities WHERE zone_id=? AND LOWER(city)=? LIMIT 1`,
        [z.id, cityLower]
      );

      if (rowsCity && rowsCity.length) {
        baseQuote = {
          source: "ZONE",
          cep,
          price: Number(z.is_free ? 0 : z.price || 0),
          prazo_dias: z.prazo_dias === null ? null : Number(z.prazo_dias),
          is_free: Boolean(z.is_free),
          zone: {
            id: z.id,
            name: z.name,
            state: z.state,
            city: place.city,
          },
        };
        break;
      }
    }

    // estado inteiro
    if (!baseQuote) {
      const zAll = zones.find((x) => Number(x.all_cities) === 1);
      if (zAll) {
        baseQuote = {
          source: "ZONE",
          cep,
          price: Number(zAll.is_free ? 0 : zAll.price || 0),
          prazo_dias: zAll.prazo_dias === null ? null : Number(zAll.prazo_dias),
          is_free: Boolean(zAll.is_free),
          zone: {
            id: zAll.id,
            name: zAll.name,
            state: zAll.state,
            city: place.city,
          },
        };
      }
    }
  }

  // ------------------------------------------------------------
  // 3) FAIXA DE CEP (fallback)
  // ------------------------------------------------------------
  if (!baseQuote) {
    const [rows] = await pool.query(
      `
        SELECT id, faixa_cep_inicio, faixa_cep_fim, preco, prazo_dias
        FROM shipping_rates
        WHERE ativo = 1
          AND ? BETWEEN faixa_cep_inicio AND faixa_cep_fim
        ORDER BY id DESC
        LIMIT 1
      `,
      [cep]
    );

    if (!rows || rows.length === 0) {
      throw new AppError("CEP sem cobertura de entrega.", ERROR_CODES.NOT_FOUND, 404);
    }

    const rate = rows[0];
    baseQuote = {
      source: "CEP_RANGE",
      cep,
      price: Number(rate.preco || 0),
      prazo_dias: Number(rate.prazo_dias || 0),
      is_free: Number(rate.preco || 0) === 0,
      zone: null,
    };
  }

  // ------------------------------------------------------------
  // 4) PRIORIDADE FINAL (aplica regra do produto antes de retornar)
  // ------------------------------------------------------------
  if (productFree) {
    return {
      cep: baseQuote.cep,
      price: 0,
      prazo_dias: baseQuote.prazo_dias === undefined ? null : baseQuote.prazo_dias,
      is_free: true,
      ruleApplied: "PRODUCT_FREE",
      freeItems,
      zone: baseQuote.zone,
    };
  }

  return {
    cep: baseQuote.cep,
    price: baseQuote.price,
    prazo_dias: baseQuote.prazo_dias === undefined ? null : baseQuote.prazo_dias,
    is_free: Boolean(baseQuote.is_free),
    ruleApplied: baseQuote.source === "ZONE" ? "ZONE" : "CEP_RANGE",
    freeItems,
    zone: baseQuote.zone,
  };
}

module.exports = {
  getQuote,
  parseCep,
  normalizeItems,
};
