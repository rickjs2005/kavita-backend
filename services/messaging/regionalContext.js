"use strict";

// services/messaging/regionalContext.js
//
// Banco de inteligencia regional para humanizar mensagens automatizadas
// no Mercado do Cafe. Cada microrregiao tem caracteristicas comerciais
// e tecnicas que um comprador real conhece de cabeca:
//
//   - altitude tipica (afeta perfil de bebida)
//   - qualidade percebida (boa bebida, dura, encorpada, frutada...)
//   - perfil comercial dominante (interno, exportacao, especial)
//   - vocabulario regional (cafe da roca, lote, peneira, bebida)
//   - destaque (caracteristica que comprador menciona como elogio)
//
// Esses campos alimentam variantes de mensagem que demonstram
// conhecimento real do mercado, em vez de copy generica.

/** Microrregioes catalogadas. Cada item lista as cidades que pertencem
 *  a microrregiao e os atributos comerciais. Cidades em UPPERCASE sao
 *  comparadas em lowercase + sem acento durante lookup. */
const REGIONS = [
  {
    region: "zona_mata",
    microrregiao: "Manhuaçu",
    cities: [
      "manhuacu", "manhumirim", "matipo", "luisburgo", "lajinha",
      "simonesia", "santana do manhuacu", "vermelho novo",
      "santa margarida", "chale", "durande", "ipanema",
      "martins soares", "raul soares", "alto jequitiba",
      "alto caparao", "caparao", "caputira", "reduto",
    ],
    altitudeMedia: 850,
    qualidadeTipica: "boa_bebida_doce",
    perfilComercial: ["interno_premium", "exportacao_pequena"],
    destaque: "café com nota frutada e bebida doce",
    vocabularioLocal: ["lote", "bebida", "peneira", "tulha", "saca", "arroba"],
    epitetoComprador: "comprador da região",
    contextoMercado: [
      "Mercado da região costuma estar firme nessa época.",
      "Exportador anda pegando café da Manhuaçu com perfil bom.",
      "Café daqui vem entrando bem nas peneiras maiores.",
    ],
  },
  {
    region: "zona_mata",
    microrregiao: "Caparaó",
    cities: [
      "alto caparao", "caparao", "alto jequitiba", "manhuacu",
      "manhumirim", "espera feliz", "iuna", "iaciara",
    ],
    altitudeMedia: 1100,
    qualidadeTipica: "especial",
    perfilComercial: ["especial", "exportacao_pequena", "premiacao"],
    destaque: "café especial de altitude com premiação concorrida",
    vocabularioLocal: ["lote", "microlote", "bebida", "fermentação", "natural", "honey"],
    epitetoComprador: "comprador de café especial",
    contextoMercado: [
      "Cafés de Caparaó tem aparecido em prêmio bom esse ano.",
      "Microlote de altitude tá com procura forte de exportador especial.",
    ],
  },
  {
    region: "zona_mata",
    microrregiao: "Viçosa/Ponte Nova",
    cities: ["vicosa", "ponte nova", "abre campo", "paula candido"],
    altitudeMedia: 700,
    qualidadeTipica: "comercial_boa",
    perfilComercial: ["interno", "exportacao_grande"],
    destaque: "café de boa apresentação e volume consistente",
    vocabularioLocal: ["lote", "peneira", "café da roça", "tulha"],
    epitetoComprador: "comprador da região",
    contextoMercado: [
      "Mercado tá vindo bem firme nessa época.",
      "Tem comprador entrando com volume essa semana.",
    ],
  },
  {
    region: "sul_minas",
    microrregiao: "Varginha/Três Pontas",
    cities: [
      "varginha", "tres pontas", "carmo da cachoeira", "elói mendes",
      "campos gerais", "boa esperanca", "machado", "alfenas", "guaxupe",
      "poco fundo", "monsenhor paulo",
    ],
    altitudeMedia: 950,
    qualidadeTipica: "encorpada_doce",
    perfilComercial: ["interno_grande", "exportacao_grande", "industria"],
    destaque: "café encorpado com volume consistente para exportação",
    vocabularioLocal: ["lote", "saca", "peneira", "bebida dura", "café cereja"],
    epitetoComprador: "comprador de exportação",
    contextoMercado: [
      "Exportador grande tá comprando bem essa semana.",
      "Mercado abriu firme — bebida dura tá com prêmio.",
      "Cafés do Sul tão sustentando preço melhor essa janela.",
    ],
  },
  {
    region: "cerrado",
    microrregiao: "Cerrado Mineiro",
    cities: [
      "patrocinio", "monte carmelo", "patos de minas",
      "carmo do paranaiba", "araxa", "sao gotardo",
      "rio paranaiba", "presidente olegario",
    ],
    altitudeMedia: 1050,
    qualidadeTipica: "doce_uniforme",
    perfilComercial: ["exportacao_grande", "denominacao_origem"],
    destaque: "café com perfil uniforme e denominação de origem",
    vocabularioLocal: ["lote", "saca", "bica", "café cereja", "arara"],
    epitetoComprador: "comprador do Cerrado",
    contextoMercado: [
      "Cerrado tá entregando volume bom essa safra.",
      "Exportação tá pagando bem cafés com DO.",
    ],
  },
];

/**
 * Normaliza string de cidade para lookup: lowercase, sem acentos, trim.
 * "MANHUAÇU" -> "manhuacu", "Três Pontas" -> "tres pontas".
 */
function _normCity(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Retorna inteligencia regional para a cidade dada. Faz match na
 * primeira microrregiao cujas cities contem a cidade normalizada.
 *
 * Se nao houver match, retorna intel "outro" minimo — caller decide
 * usar copy generico.
 *
 * @param {string} cidade
 * @returns {{
 *   region: string,
 *   microrregiao: string|null,
 *   altitudeMedia: number|null,
 *   qualidadeTipica: string|null,
 *   perfilComercial: string[],
 *   destaque: string|null,
 *   vocabularioLocal: string[],
 *   epitetoComprador: string,
 *   contextoMercado: string[],
 * }}
 */
function getRegionalIntel(cidade) {
  const norm = _normCity(cidade);
  if (!norm) {
    return {
      region: "outro",
      microrregiao: null,
      altitudeMedia: null,
      qualidadeTipica: null,
      perfilComercial: [],
      destaque: null,
      vocabularioLocal: ["lote", "saca", "bebida"],
      epitetoComprador: "comprador",
      contextoMercado: [],
    };
  }
  for (const r of REGIONS) {
    if (r.cities.includes(norm)) {
      return {
        region: r.region,
        microrregiao: r.microrregiao,
        altitudeMedia: r.altitudeMedia,
        qualidadeTipica: r.qualidadeTipica,
        perfilComercial: r.perfilComercial.slice(),
        destaque: r.destaque,
        vocabularioLocal: r.vocabularioLocal.slice(),
        epitetoComprador: r.epitetoComprador,
        contextoMercado: r.contextoMercado.slice(),
      };
    }
  }
  return {
    region: "outro",
    microrregiao: null,
    altitudeMedia: null,
    qualidadeTipica: null,
    perfilComercial: [],
    destaque: null,
    vocabularioLocal: ["lote", "saca", "bebida"],
    epitetoComprador: "comprador",
    contextoMercado: [],
  };
}

/**
 * Estacao do cafe: safra (junho-setembro) vs entressafra. Influencia
 * urgencia comercial — entressafra costuma ter mercado mais firme,
 * safra tem volume e pressao de venda.
 *
 * @param {Date} [now=new Date()]
 * @returns {"safra" | "pos_safra" | "entressafra" | "pre_safra"}
 */
function getMarketSeason(now = new Date()) {
  const month = now.getMonth() + 1; // 1-12
  if (month >= 6 && month <= 9) return "safra";
  if (month === 10 || month === 11) return "pos_safra";
  if (month >= 12 || month <= 2) return "entressafra";
  return "pre_safra"; // marco-maio
}

/** Frase curta de contexto de mercado pela estacao + intel regional.
 *  Usada como bonus em mensagens premium/agressivas. */
function getMarketUrgencyHint(intel, now = new Date()) {
  const season = getMarketSeason(now);
  // Estacao da preferencia em cima de contextoMercado da regiao.
  const fromRegion = intel?.contextoMercado || [];
  if (season === "safra") {
    return [
      ...fromRegion,
      "Mercado tá ativo com a safra entrando agora.",
      "Tem comprador pegando volume cheio essa semana.",
    ];
  }
  if (season === "entressafra") {
    return [
      ...fromRegion,
      "Mercado anda firme nessa entressafra.",
      "Café guardado tá com procura boa agora.",
    ];
  }
  if (season === "pos_safra") {
    return [
      ...fromRegion,
      "Pós-safra costuma ter exportador correndo atrás de lote bom.",
    ];
  }
  // pre_safra
  return [
    ...fromRegion,
    "Antes da safra a procura por café guardado costuma firmar.",
  ];
}

module.exports = {
  REGIONS,
  getRegionalIntel,
  getMarketSeason,
  getMarketUrgencyHint,
};
