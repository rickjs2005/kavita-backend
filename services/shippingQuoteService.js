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
 *
 * Observação: adicionamos timeout defensivo para não travar requisições
 * em caso de instabilidade externa.
 */
async function lookupCep(cep) {
  const controller = new AbortController();
  const timeoutMs = 3500;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://viacep.com.br/ws/${cep}/json/`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.erro) return null;

    return {
      state: String(data.uf || "").toUpperCase(),
      city: String(data.localidade || "").trim(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
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

/**
 * Converte prazo para number|null de forma segura.
 */
function toPrazo(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Consolida o prazo final:
 * - pega o maior prazo entre a base (zona/faixa CEP) e o maior prazo de produto do carrinho.
 * - se ambos forem null, retorna null.
 */
function mergePrazo(basePrazo, productMaxPrazo) {
  const b = toPrazo(basePrazo);
  const p = toPrazo(productMaxPrazo);

  if (b === null && p === null) return null;
  if (b === null) return p;
  if (p === null) return b;
  return Math.max(b, p);
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
  //    + Coleta prazo máximo por produto (shipping_prazo_dias)
  // ------------------------------------------------------------
  const uniqueIds = Array.from(new Set(items.map((i) => i.id)));

  // Mudança cuidadosa: adicionamos shipping_prazo_dias no SELECT.
  // Se a coluna existir (como esperado pelo seu admin), ok.
  // Se não existir, o MySQL vai erro 1054. Nesse caso, você deve garantir a coluna
  // (o ideal é já existir, pois seu admin já expõe esse campo).
  const [products] = await pool.query(
    `
      SELECT id, shipping_free, shipping_free_from_qty, shipping_prazo_dias
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

  // prazo máximo dentre os produtos do carrinho (ignora null)
  let productMaxPrazo = null;

  for (const it of items) {
    const p = byId.get(Number(it.id));
    const q = Number(it.quantidade);

    const qual = qualifiesProductFree(p, q);

    if (qual.ok) {
      productFree = true;
      freeItems.push({ id: Number(it.id), quantidade: q, reason: qual.reason });
    }

    const pp = toPrazo(p?.shipping_prazo_dias);
    if (pp !== null) {
      productMaxPrazo = productMaxPrazo === null ? pp : Math.max(productMaxPrazo, pp);
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
          prazo_dias: toPrazo(z.prazo_dias),
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
          prazo_dias: toPrazo(zAll.prazo_dias),
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
      prazo_dias: toPrazo(rate.prazo_dias),
      is_free: Number(rate.preco || 0) === 0,
      zone: null,
    };
  }

  // ------------------------------------------------------------
  // 3.1) CONSOLIDA PRAZO FINAL (zona/faixa CEP) vs (produtos)
  //      Regra: prazo final = MAIOR dos dois (como e-commerce grande).
  // ------------------------------------------------------------
  const prazoFinal = mergePrazo(baseQuote.prazo_dias, productMaxPrazo);

  // ------------------------------------------------------------
  // 4) PRIORIDADE FINAL (aplica regra do produto antes de retornar)
  // ------------------------------------------------------------
  if (productFree) {
    return {
      cep: baseQuote.cep,
      price: 0,
      prazo_dias: prazoFinal,
      is_free: true,
      ruleApplied: "PRODUCT_FREE",
      freeItems,
      zone: baseQuote.zone,
    };
  }

  return {
    cep: baseQuote.cep,
    price: baseQuote.price,
    prazo_dias: prazoFinal,
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
