"use strict";

// services/messaging/messageSequencer.js
//
// Quebra um texto longo em rajadas (bursts) curtas para simular
// digitacao humana no WhatsApp. Conversa de comprador real raramente
// chega como bloco unico de 5 linhas — vem em 2-3 mensagens curtas
// com pausa de 2-5s entre elas.
//
// Uso:
//   const bursts = splitIntoBursts(text);
//   for (const b of bursts) {
//     await sleep(b.delayMs);
//     await whatsappAdapter.sendText(to, b.text);
//   }
//
// O sender gerencia o sleep — esse modulo so devolve a sequencia.

const TYPING_CHARS_PER_SECOND = 35;
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 4500;
const MAX_BURST_CHARS = 220;
const MIN_BURST_CHARS = 30;

/**
 * Quebra em bursts. Estratégia:
 *   1) split por linha em branco (paragrafo) primeiro
 *   2) se algum paragrafo for muito longo, split em frases (.!?)
 *   3) se duas frases curtas seguidas formam um burst < MAX, junta
 *
 * Cada burst recebe um delay proporcional ao tamanho do que vem antes
 * (simula tempo de digitacao do remetente humano).
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {number} [opts.maxBurstChars]
 * @returns {Array<{text: string, delayMs: number}>}
 */
function splitIntoBursts(text, opts = {}) {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  const maxChars = opts.maxBurstChars ?? MAX_BURST_CHARS;
  const trimmed = text.trim();

  // Primeira passagem: separar por linhas em branco (paragrafos).
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Segunda passagem: paragrafos longos viram frases.
  const fragments = [];
  for (const p of paragraphs) {
    if (p.length <= maxChars) {
      fragments.push(p);
    } else {
      // split em frases preservando pontuacao final
      const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
      for (const s of sentences) {
        const t = s.trim();
        if (t) fragments.push(t);
      }
    }
  }

  // Terceira passagem: tentar combinar fragments curtos em burst maior
  // (sem ultrapassar maxChars). Evita 5 mensagens minusculas.
  const bursts = [];
  let current = "";
  for (const f of fragments) {
    if (!current) {
      current = f;
      continue;
    }
    const combined = `${current}\n${f}`;
    if (combined.length <= maxChars && current.length < MIN_BURST_CHARS) {
      current = combined;
    } else {
      bursts.push(current);
      current = f;
    }
  }
  if (current) bursts.push(current);

  // Quarta passagem: calcular delay de cada burst. O delay simula a
  // digitacao do TEXTO ATUAL (nao do anterior — quem ve a mensagem
  // chegar so percebe pausa entre uma e outra).
  const result = bursts.map((bText, idx) => {
    const baseDelay = idx === 0
      ? 0
      : computeTypingDelay(bursts[idx]);
    return {
      text: bText,
      delayMs: clamp(baseDelay, idx === 0 ? 0 : MIN_DELAY_MS, MAX_DELAY_MS),
    };
  });

  return result;
}

/** Delay proporcional ao numero de caracteres do texto a digitar. */
function computeTypingDelay(text) {
  if (!text) return MIN_DELAY_MS;
  const seconds = text.length / TYPING_CHARS_PER_SECOND;
  return Math.round(seconds * 1000);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = {
  splitIntoBursts,
  computeTypingDelay,
  // expor para test
  TYPING_CHARS_PER_SECOND,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  MAX_BURST_CHARS,
  MIN_BURST_CHARS,
};
