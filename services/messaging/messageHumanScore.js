"use strict";

// services/messaging/messageHumanScore.js
//
// Quality gate de mensagens humanizadas. Recebe um texto pronto pra
// envio e retorna { score: 0-100, issues: [...] }. Score < 60 e' sinal
// pra bloquear envio (caller decide se manda mesmo, escolhe variante
// alternativa ou loga e cai pro fallback).
//
// Detectores cobrem os 8 problemas que mais matam credibilidade:
//
//   1) repeticao de palavras (any > 3x)
//   2) densidade de "Kavita" / "plataforma" / "sistema"
//   3) densidade de nome do produtor (> 2x parece insistente)
//   4) densidade de cidade (> 2x soa robotico)
//   5) marcadores de template ("mensagem automática", "atenciosamente")
//   6) formalidade excessiva ("prezado", "venho por meio")
//   7) tamanho excessivo (> 4 paragrafos = textão de RH)
//   8) frases artificiais ("recebi seu interesse", "como posso ajudar")
//
// Cada violation deduz pontos. Score base = 100.

const TEMPLATE_MARKERS = [
  "mensagem automática",
  "mensagem automatica",
  "this is an automated",
  "atenciosamente,",
  "cordialmente,",
  "att.,",
  "atenciosamente.",
];

const FORMALIDADE_EXCESSIVA = [
  "prezado(a)",
  "prezado",
  "prezada",
  "venho por meio",
  "no intuito de",
  "informo que",
  "ressalto que",
  "solicito gentilmente",
  "favor verificar",
  "aguardamos seu retorno",
];

const FRASES_ARTIFICIAIS = [
  "recebi seu interesse",
  "como posso ajudar",
  "podemos conversar",
  "fico à disposição",
  "fico a disposição",
  "qualquer dúvida estou à disposição",
  "agradecemos seu contato",
  "esperamos ouvi-lo em breve",
];

const PLATAFORMA_WORDS = ["kavita", "plataforma", "sistema", "painel"];

/**
 * Conta ocorrencias case-insensitive de uma substring no texto.
 */
function countOccurrences(text, needle) {
  if (!text || !needle) return 0;
  const lowText = text.toLowerCase();
  const lowNeedle = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = lowText.indexOf(lowNeedle, idx)) !== -1) {
    count++;
    idx += lowNeedle.length;
  }
  return count;
}

/** Conta palavras (split em whitespace) que aparecem 4+ vezes. Ignora
 *  stop words curtas (ate 2 chars). Retorna lista de [palavra, count]. */
function findRepeatedWords(text) {
  if (!text) return [];
  const words = text.toLowerCase().match(/[a-záéíóúâêôãõç]{3,}/gi) || [];
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const repeated = Object.entries(counts).filter(([, n]) => n >= 4);
  return repeated;
}

/**
 * Calcula score de naturalidade. Score ∈ [0, 100]:
 *   ≥ 80 — humano natural, manda
 *   60-79 — aceitavel, manda mas log
 *   < 60 — rejeitar, fallback ou variante alternativa
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {string} [opts.produtorNome]   nome do produtor para contar densidade
 * @param {string} [opts.cidade]         cidade para contar densidade
 * @param {boolean} [opts.firstContact]  se true, mencao a "Kavita" e' aceitavel
 * @returns {{score: number, issues: Array<{code: string, message: string, deduction: number}>}}
 */
function score(text, opts = {}) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return {
      score: 0,
      issues: [
        { code: "empty", message: "Texto vazio.", deduction: 100 },
      ],
    };
  }

  const issues = [];
  let s = 100;

  // 1) repeticao de palavras
  const repeated = findRepeatedWords(text);
  for (const [w, n] of repeated) {
    const ded = Math.min(15, (n - 3) * 5);
    issues.push({
      code: "repeated_word",
      message: `Palavra "${w}" repete ${n}×.`,
      deduction: ded,
    });
    s -= ded;
  }

  // 2) densidade de plataforma
  let platformCount = 0;
  for (const w of PLATAFORMA_WORDS) {
    platformCount += countOccurrences(text, w);
  }
  const platformLimit = opts.firstContact ? 2 : 1;
  if (platformCount > platformLimit) {
    const excess = platformCount - platformLimit;
    const ded = Math.min(20, excess * 8);
    issues.push({
      code: "platform_density",
      message: `Menção a Kavita/plataforma ${platformCount}× (limite ${platformLimit}).`,
      deduction: ded,
    });
    s -= ded;
  }

  // 3) densidade de nome do produtor
  if (opts.produtorNome) {
    const firstName = String(opts.produtorNome).trim().split(/\s+/)[0];
    if (firstName.length >= 3) {
      const nameCount = countOccurrences(text, firstName);
      if (nameCount > 2) {
        const ded = Math.min(15, (nameCount - 2) * 6);
        issues.push({
          code: "name_density",
          message: `Nome "${firstName}" aparece ${nameCount}×.`,
          deduction: ded,
        });
        s -= ded;
      }
    }
  }

  // 4) densidade de cidade
  if (opts.cidade) {
    const cidade = String(opts.cidade).trim();
    if (cidade.length >= 3) {
      const cityCount = countOccurrences(text, cidade);
      if (cityCount > 2) {
        const ded = Math.min(12, (cityCount - 2) * 5);
        issues.push({
          code: "city_density",
          message: `Cidade "${cidade}" aparece ${cityCount}×.`,
          deduction: ded,
        });
        s -= ded;
      }
    }
  }

  // 5) marcadores de template — fatal: 1 marcador puxa o score abaixo
  // do threshold default (60) sozinho. Eh' o sinal mais forte de
  // mensagem robotica.
  for (const marker of TEMPLATE_MARKERS) {
    if (text.toLowerCase().includes(marker)) {
      issues.push({
        code: "template_marker",
        message: `Frase de template detectada: "${marker}".`,
        deduction: 45,
      });
      s -= 45;
      break;
    }
  }

  // 6) formalidade excessiva
  for (const f of FORMALIDADE_EXCESSIVA) {
    if (text.toLowerCase().includes(f)) {
      issues.push({
        code: "formal_phrase",
        message: `Frase formal detectada: "${f}".`,
        deduction: 12,
      });
      s -= 12;
      break;
    }
  }

  // 7) tamanho excessivo
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length > 4) {
    const excess = paragraphs.length - 4;
    const ded = Math.min(15, excess * 5);
    issues.push({
      code: "too_long",
      message: `${paragraphs.length} parágrafos (limite 4 para WhatsApp).`,
      deduction: ded,
    });
    s -= ded;
  }
  if (text.length > 700) {
    const ded = 10;
    issues.push({
      code: "too_long_chars",
      message: `Texto com ${text.length} chars (limite 700).`,
      deduction: ded,
    });
    s -= ded;
  }

  // 8) frases artificiais
  for (const f of FRASES_ARTIFICIAIS) {
    if (text.toLowerCase().includes(f)) {
      issues.push({
        code: "artificial_phrase",
        message: `Frase artificial: "${f}".`,
        deduction: 18,
      });
      s -= 18;
      break;
    }
  }

  s = Math.max(0, Math.min(100, s));
  return { score: s, issues };
}

/**
 * True quando o texto passa o threshold (default 60). Helper boolean
 * pra callers que so querem aceitar/rejeitar.
 */
function isAcceptable(text, opts = {}) {
  const result = score(text, opts);
  const threshold = opts.threshold ?? 60;
  return result.score >= threshold;
}

module.exports = {
  score,
  isAcceptable,
  // expor detectors pra reuse e teste
  countOccurrences,
  findRepeatedWords,
  TEMPLATE_MARKERS,
  FORMALIDADE_EXCESSIVA,
  FRASES_ARTIFICIAIS,
  PLATAFORMA_WORDS,
};
