// services/cotacoes/noticiasAgricolasAdapter.js
//
// Adapter opcional para scraping do indicador CEPEA exibido na página
// pública de notícias agrícolas. ATENÇÃO:
//
//   - Scraping de HTML de site B2B pode violar ToS. Validar antes
//     de ligar em produção.
//   - HTML pode mudar → o parser abaixo é tolerante (regex) e falha
//     silenciosamente se não encontrar os valores.
//   - Cache 15min no service evita hammering.
//
// Para ativar:
//   COTACAO_CAFE_PROVIDER=noticias_agricolas
//
// Se preferir uma API paga (ex: CEPEA B2B), criar outro adapter com
// o mesmo shape e setar COTACAO_CAFE_PROVIDER para o nome dele.
"use strict";

const PROVIDER = "noticias_agricolas";
const SOURCE_URL =
  "https://www.noticiasagricolas.com.br/cotacoes/cafe/cafe-arabica-cepea";

function isConfigured() {
  // Sem credencial — adapter só opera se o provider estiver
  // explicitamente escolhido via env. Decisão deliberada: alguém
  // precisa confirmar que pode fazer scraping antes de ligar.
  return (
    (process.env.COTACAO_CAFE_PROVIDER || "").toLowerCase() ===
    PROVIDER
  );
}

/**
 * Baixa a página pública e extrai preço/variação do indicador
 * arábica. Retorno:
 *   { price_cents, variation_pct, as_of, source_url }
 *
 * Se a extração falhar (HTML mudou), retorna null — o service
 * trata como cache miss e não mostra ticker nessa atualização.
 */
async function fetchArabicaPrice() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent":
        "KavitaBot/1.0 (+https://kavita.com.br) — cotacao mirror 15min",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Parsers tolerantes. Pegamos o PRIMEIRO match — a página mostra
  // "valor atual" em destaque antes de variações por praça/tipo.
  // Cada padrão cobre uma variação comum de formatação:
  //   1.800,72  |  R$ 1.800,72  |  1800,72
  const priceMatch =
    html.match(
      /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:por\s+saca|\/\s*saca|de\s+60\s*kg)?/i,
    ) || null;
  const variationMatch =
    html.match(/\(\s*([+-]?\d+[\.,]\d+)\s*%\s*\)/) ||
    html.match(/Var[^<]*?([+-]?\d+[\.,]\d+)\s*%/i);

  if (!priceMatch) return null;

  // "1.800,72" → 180072 centavos
  const priceNormalized = priceMatch[1].replace(/\./g, "").replace(",", ".");
  const priceReais = parseFloat(priceNormalized);
  if (!Number.isFinite(priceReais) || priceReais <= 0) return null;

  const priceCents = Math.round(priceReais * 100);
  let variationPct = null;
  if (variationMatch) {
    variationPct = parseFloat(variationMatch[1].replace(",", "."));
    if (!Number.isFinite(variationPct)) variationPct = null;
  }

  return {
    price_cents: priceCents,
    variation_pct: variationPct,
    as_of: new Date().toISOString().slice(0, 10),
    source_url: SOURCE_URL,
  };
}

module.exports = { PROVIDER, isConfigured, fetchArabicaPrice };
