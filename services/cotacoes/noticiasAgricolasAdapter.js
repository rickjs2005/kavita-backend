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
// Path atualizado em 2026-04-20 — o site reorganizou a árvore e o
// path antigo (/cotacoes/cafe/cafe-arabica-cepea) virou 404.
const SOURCE_URL =
  "https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica";

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
      // Header HTTP é ByteString (ASCII) — nada de em-dash/acento.
      "User-Agent":
        "KavitaBot/1.0 (+https://kavita.com.br) cotacao-mirror-15min",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Estratégia de parser em dois níveis, do mais estrito ao mais
  // tolerante. Strict-first porque a página mistura preço real do
  // indicador com propagandas e outros campos "R$ X,YZ".
  //
  // Nível 1 — tabela estruturada do indicador:
  //   <table class="cotacao">…<th>Valor R$</th><td>1.804,50</td>…
  //   Pegamos o primeiro <td> após "Valor R$" — é o indicador principal.
  //
  // Nível 2 — fallback: buscar valor no formato típico de saca de
  //   café (4 dígitos antes da vírgula, entre 500 e 5000 reais), o
  //   que elimina preços tipo "R$ 4,97" (propaganda de assinatura).
  //
  // Se nada passa a validação sanitária (faixa plausível), null.

  let priceReais = null;

  // Nível 1: busca estruturada em tabela.
  const tableMatch = html.match(
    /Valor\s+R\$[\s\S]{0,200}?<td[^>]*>\s*(\d{1,3}(?:\.\d{3})+,\d{2})\s*<\/td>/i,
  );
  if (tableMatch) {
    priceReais = parseFloat(
      tableMatch[1].replace(/\./g, "").replace(",", "."),
    );
  }

  // Nível 2: fallback tolerante com sanidade de faixa.
  if (!Number.isFinite(priceReais) || priceReais < 500 || priceReais > 5000) {
    // Em 2026 preço da saca arábica fica tipicamente em R$ 1.000–3.000.
    // Relaxamos para 500–5000 por segurança.
    const allMatches = html.match(/(\d{1,2}\.\d{3},\d{2})/g) || [];
    for (const m of allMatches) {
      const v = parseFloat(m.replace(/\./g, "").replace(",", "."));
      if (v >= 500 && v <= 5000) {
        priceReais = v;
        break;
      }
    }
  }

  if (
    !Number.isFinite(priceReais) ||
    priceReais < 500 ||
    priceReais > 5000
  ) {
    // Não conseguimos identificar o indicador. Preferimos não mostrar
    // nada a mostrar valor errado (ver ADR do service: "não inventa preço").
    return null;
  }

  // Variação é best-effort — não essencial para o ticker.
  const variationMatch =
    html.match(/\(\s*([+-]?\d+[\.,]\d+)\s*%\s*\)/) ||
    html.match(/Var[^<]*?([+-]?\d+[\.,]\d+)\s*%/i);

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
