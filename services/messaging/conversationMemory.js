"use strict";

// services/messaging/conversationMemory.js
//
// Camada de memória conversacional do lead. Lê e persiste o JSON em
// `corretora_leads.conversational_state`.
//
// Objetivo: o sistema NUNCA pergunta 2 vezes a mesma coisa. Se o
// produtor já informou volume, a próxima mensagem deve referenciar o
// volume — não pedi-lo de novo.
//
// Forma do estado:
//   {
//     "stage": "primeiro_contato" | "interesse" | "amostra" | "negociacao" | "fechamento" | "logistica",
//     "knownFacts": {                     // fatos confirmados do produtor
//       "volume": "200_500",
//       "tipoCafe": "arabica_especial",
//       "amostraPrometida": true,
//       "amostraEnviada": false,
//       "precoPedido": 1250
//     },
//     "askedAbout": ["volume", "amostra"], // tudo que ja perguntamos
//     "outboundCount": 2,                  // mensagens que enviamos
//     "inboundCount": 0,                   // respostas do produtor
//     "lastOutboundAt": "2026-05-08T...",
//     "lastInboundAt": null,
//     "lastIntent": "corretora_primeiro_contato_produtor",
//     "lastVariantHash": "abc123",         // pra evitar repetir mesma copy
//     "ignoredCount": 0                    // dias sem responder
//   }
//
// API e' read-only-friendly: erros nao quebram fluxo de envio.
// Persistencia e' best-effort. Se o write falhar, log + segue.

const pool = require("../../config/pool");
const logger = require("../../lib/logger");

const STAGE_PROGRESSION = [
  "primeiro_contato",
  "interesse",
  "amostra",
  "negociacao",
  "fechamento",
  "logistica",
];

const DEFAULT_STATE = {
  stage: "primeiro_contato",
  knownFacts: {},
  askedAbout: [],
  outboundCount: 0,
  inboundCount: 0,
  lastOutboundAt: null,
  lastInboundAt: null,
  lastIntent: null,
  lastVariantHash: null,
  ignoredCount: 0,
};

/**
 * Le o estado conversacional do lead. Tolerante a JSON corrompido —
 * retorna DEFAULT_STATE se nao houver linha ou se o JSON nao parsear.
 */
async function loadMemory(leadId, conn = pool) {
  if (!leadId) return clone(DEFAULT_STATE);
  try {
    const [[row]] = await conn.query(
      "SELECT conversational_state FROM corretora_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    if (!row || row.conversational_state == null) return clone(DEFAULT_STATE);
    let parsed = row.conversational_state;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }
    return mergeWithDefault(parsed);
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), leadId },
      "conversationMemory.loadMemory_failed",
    );
    return clone(DEFAULT_STATE);
  }
}

/**
 * Salva o estado conversacional. Best-effort: log + segue em caso de
 * erro (nunca quebra envio de mensagem).
 */
async function saveMemory(leadId, state, conn = pool) {
  if (!leadId || !state) return false;
  try {
    await conn.query(
      "UPDATE corretora_leads SET conversational_state = ? WHERE id = ?",
      [JSON.stringify(state), leadId],
    );
    return true;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), leadId },
      "conversationMemory.saveMemory_failed",
    );
    return false;
  }
}

/**
 * Registra que enviamos uma mensagem (intent X via variant Y) ao
 * produtor. Atualiza outboundCount, lastIntent, lastOutboundAt e
 * lastVariantHash. Nao avanca stage automaticamente (caller decide
 * via advanceStage).
 *
 * @param {number} leadId
 * @param {Object} payload
 * @param {string} payload.intent
 * @param {string} [payload.variantHash]
 * @param {Date}   [payload.now]
 */
async function recordOutbound(leadId, { intent, variantHash, now }, conn = pool) {
  const state = await loadMemory(leadId, conn);
  state.outboundCount = (state.outboundCount || 0) + 1;
  state.lastIntent = intent || state.lastIntent;
  state.lastVariantHash = variantHash || state.lastVariantHash;
  state.lastOutboundAt = (now || new Date()).toISOString();
  return saveMemory(leadId, state, conn);
}

/**
 * Registra que o produtor respondeu (inbound). Reseta ignoredCount,
 * incrementa inboundCount, atualiza lastInboundAt.
 */
async function recordInbound(leadId, { now } = {}, conn = pool) {
  const state = await loadMemory(leadId, conn);
  state.inboundCount = (state.inboundCount || 0) + 1;
  state.lastInboundAt = (now || new Date()).toISOString();
  state.ignoredCount = 0;
  return saveMemory(leadId, state, conn);
}

/**
 * Marca que ja perguntamos sobre `topic`. Evita repetir pergunta na
 * proxima mensagem ("ja perguntei volume, nao pergunto de novo").
 *
 * @param {number} leadId
 * @param {string} topic   ex: "volume", "amostra", "preco", "safra"
 */
async function markAsked(leadId, topic, conn = pool) {
  const state = await loadMemory(leadId, conn);
  if (!state.askedAbout) state.askedAbout = [];
  if (!state.askedAbout.includes(topic)) {
    state.askedAbout.push(topic);
  }
  return saveMemory(leadId, state, conn);
}

/**
 * Adiciona um fato confirmado (do produtor pra corretora). Sobrescreve
 * o valor anterior se a chave ja existir — produtor pode atualizar
 * informacoes ("falei 200, agora consegui 300").
 */
async function setKnownFact(leadId, key, value, conn = pool) {
  const state = await loadMemory(leadId, conn);
  if (!state.knownFacts) state.knownFacts = {};
  state.knownFacts[key] = value;
  return saveMemory(leadId, state, conn);
}

/**
 * Avanca o estagio conversacional. Se ja estiver em estagio mais
 * avancado, nao retroage (clamp).
 */
async function advanceStage(leadId, targetStage, conn = pool) {
  const state = await loadMemory(leadId, conn);
  const currentIdx = STAGE_PROGRESSION.indexOf(state.stage || "primeiro_contato");
  const targetIdx = STAGE_PROGRESSION.indexOf(targetStage);
  if (targetIdx === -1) return false;
  if (targetIdx > currentIdx) {
    state.stage = targetStage;
    return saveMemory(leadId, state, conn);
  }
  return false;
}

/** Sugestao do proximo intent baseada no estagio atual + fatos conhecidos. */
function suggestNextIntent(state) {
  const s = state || DEFAULT_STATE;
  switch (s.stage) {
    case "primeiro_contato":
      return s.outboundCount === 0
        ? "corretora_primeiro_contato_produtor"
        : "corretora_lembrete_retorno_produtor";
    case "interesse":
      return s.knownFacts?.amostraPrometida
        ? "produtor_solicitar_amostra"
        : "corretora_pedir_amostra";
    case "amostra":
      return "produtor_aguardando_amostra";
    case "negociacao":
      return "corretora_proposta_enviada";
    case "fechamento":
      return "produtor_contrato_gerado";
    case "logistica":
      return "produtor_logistica_coleta";
    default:
      return "corretora_primeiro_contato_produtor";
  }
}

/**
 * Helper sincrono — recebe state ja carregado e retorna se ja pediu
 * sobre topico. Util em variantes de mensagem que querem decidir copy
 * sem fazer query async.
 */
function hasAskedAbout(state, topic) {
  return Array.isArray(state?.askedAbout) && state.askedAbout.includes(topic);
}

/** Idem para fatos conhecidos. */
function hasKnownFact(state, key) {
  return state?.knownFacts != null && key in state.knownFacts;
}

function getKnownFact(state, key) {
  return state?.knownFacts?.[key] ?? null;
}

// ─── helpers internos ──────────────────────────────────────────────────

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergeWithDefault(parsed) {
  return {
    ...clone(DEFAULT_STATE),
    ...(parsed || {}),
    knownFacts: {
      ...(parsed?.knownFacts || {}),
    },
    askedAbout: Array.isArray(parsed?.askedAbout)
      ? parsed.askedAbout.slice()
      : [],
  };
}

module.exports = {
  STAGE_PROGRESSION,
  DEFAULT_STATE,
  loadMemory,
  saveMemory,
  recordOutbound,
  recordInbound,
  markAsked,
  setKnownFact,
  advanceStage,
  suggestNextIntent,
  hasAskedAbout,
  hasKnownFact,
  getKnownFact,
  // expostos para teste/diagnostico
  _internals: { clone, mergeWithDefault },
};
