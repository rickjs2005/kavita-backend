"use strict";

// services/messaging/humanMessageBuilder.js
//
// Engine de mensagens humanas para o Mercado do Cafe (Kavita).
//
// Por que existe:
//   Mensagens automatizadas geradas via template estatico (concat de
//   placeholders) saem frias, repetidas e robotizadas. Em conversa
//   comercial real entre corretora e produtor, isso destroi credibili-
//   dade e reduz taxa de resposta.
//
//   Este modulo concentra a logica que humaniza mensagens:
//     - normaliza dados sujos (cidade em CAIXA ALTA, volume em codigo,
//       nome com sobrenome inteiro)
//     - escolhe variantes deterministicas (mesmo lead = mesma variante,
//       mas leads diferentes recebem versoes diferentes)
//     - omite campos vazios graciosamente (sem "Cidade: " com vazio)
//     - injeta saudacao por horario (Bom dia / Boa tarde / Boa noite)
//     - usa vocabulario regional do agro/cafe (sacas, peneira, lote,
//       arroba, bebida)
//     - fala da Zona da Mata / Matas de Minas / Manhuacu quando faz
//       sentido contextual
//
// O caller passa um intent (ex: "corretora_lead_recebido") + contexto
// (lead, corretora, etc). Engine retorna { subject, body } prontos.

const crypto = require("crypto");
// Modulos auxiliares — opcionais. Carregados via require() para evitar
// circular import e para falhar graciosamente caso ainda nao existam
// em ambiente legado (ex: tests unitarios isolados).
let _regional;
let _styles;
try { _regional = require("./regionalContext"); } catch { _regional = null; }
try { _styles = require("./communicationStyles"); } catch { _styles = null; }

// ---------------------------------------------------------------------------
// Normalizadores de dados sujos
// ---------------------------------------------------------------------------

/** Primeiro nome capitalizado. "RICK JANUARIO" -> "Rick". */
function firstName(fullName) {
  if (typeof fullName !== "string") return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return capitalizeWord(first);
}

/** Capitaliza primeira letra de cada palavra. "MANHUACU" -> "Manhuacu". */
function capitalizeWord(word) {
  if (!word) return word;
  return (
    word.charAt(0).toUpperCase() +
    word.slice(1).toLowerCase().replace(/(\s)([a-z])/g, (_, s, c) => s + c.toUpperCase())
  );
}

/** Capitaliza nome de cidade composto. "MANHUAÇU" -> "Manhuaçu",
 *  "santa rita do sapucaí" -> "Santa Rita do Sapucaí". Preserva
 *  preposicoes do/da/de em minusculas. */
function normalizeCidade(cidade) {
  if (typeof cidade !== "string") return null;
  const trimmed = cidade.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const minusculas = new Set(["do", "da", "de", "dos", "das", "e"]);
  return lower
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && minusculas.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Mesma logica de cidade aplicada a corrego/localidade. */
function normalizeCorrego(corrego) {
  return normalizeCidade(corrego);
}

/** Volume em formato humano. Aceita string range ("200_500"),
 *  numero (250) ou texto livre. Retorna null se nao for possivel
 *  formatar. */
function formatVolume(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return `${Math.round(value)} sacas`;
  }
  const s = String(value).trim();
  // Faixas comuns do dropdown: "ate_50", "50_200", "200_500", "500_mais"
  const rangeMap = {
    ate_50: "até 50 sacas",
    "50_200": "50 a 200 sacas",
    "200_500": "200 a 500 sacas",
    "500_mais": "acima de 500 sacas",
  };
  if (rangeMap[s]) return rangeMap[s];
  // Numero puro
  if (/^\d+$/.test(s)) return `${s} sacas`;
  // Ja vem formatado
  return s;
}

/** Tipo de cafe em texto natural. "arabica_especial" -> "arábica
 *  especial". */
function formatTipoCafe(tipo) {
  if (typeof tipo !== "string" || tipo.trim() === "") return null;
  const map = {
    arabica: "arábica",
    arabica_especial: "arábica especial",
    arabica_comercial: "arábica comercial",
    conilon: "conilon",
    conilon_robusta: "conilon/robusta",
    cereja_descascado: "cereja descascado",
    natural: "natural",
    boia: "boia",
    misto: "misto",
  };
  return map[tipo] || tipo.replace(/_/g, " ");
}

/** Saudacao por horario local (BRT). 5-12 = Bom dia; 12-18 = Boa
 *  tarde; 18-5 = Boa noite. */
function saudacao(now = new Date()) {
  // BRT = UTC-3. Date.getHours() ja retorna no fuso local do servidor;
  // como o servidor e BR, isso bate. Para staging em outro fuso,
  // ajustar via env TZ=America/Sao_Paulo.
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Detecta regiao do produtor a partir da cidade. Usado para
 *  decisoes contextuais de copy (mencionar "Zona da Mata" so faz
 *  sentido para cidades dessa regiao). */
const ZONA_MATA = new Set([
  "manhuacu",
  "manhumirim",
  "matipo",
  "luisburgo",
  "lajinha",
  "simonesia",
  "alto jequitiba",
  "alto caparao",
  "caparao",
  "caputira",
  "reduto",
  "santana do manhuacu",
  "vermelho novo",
  "abre campo",
  "santa margarida",
  "chale",
  "durande",
  "ipanema",
  "manhumirim",
  "martins soares",
  "raul soares",
  "viçosa",
  "vicosa",
  "ponte nova",
]);

function detectRegiao(cidade) {
  if (!cidade) return "outro";
  const norm = String(cidade).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (ZONA_MATA.has(norm)) return "zona_mata";
  // Sul de Minas
  if (/^(varginha|tres pontas|carmo|guaxupe|alfenas|machado|poco fundo)/.test(norm)) {
    return "sul_minas";
  }
  // Cerrado
  if (/^(patrocinio|monte carmelo|carmo do paranaiba|patos de minas)/.test(norm)) {
    return "cerrado";
  }
  return "outro";
}

/** Hash deterministico curto a partir de uma string. Usado para
 *  escolher variante reproduzivel (mesmo lead -> mesma variante). */
function deterministicIndex(seed, modulo) {
  if (modulo <= 0) return 0;
  const hash = crypto.createHash("md5").update(String(seed)).digest();
  // Pega 4 bytes para int 32-bit, fica abaixo de Number.MAX_SAFE_INTEGER.
  const n = hash.readUInt32BE(0);
  return n % modulo;
}

/** Escolhe uma variante de array. Se `seed` for fornecido, escolha e
 *  deterministica (mesmo seed -> mesmo indice). Sem seed, aleatorio. */
function pickVariation(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (seed != null) {
    return arr[deterministicIndex(seed, arr.length)];
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Helpers de copy condicional
// ---------------------------------------------------------------------------

/** Junta partes de uma frase pulando vazios. " Hello | World | "
 *  vira "Hello | World" sem separadores feios. */
function joinNonEmpty(parts, separator = " · ") {
  return parts.filter(Boolean).join(separator);
}

/** Concatena pedacos de texto numa lista natural humana:
 *    ["A"]              -> "A"
 *    ["A", "B"]         -> "A e B"
 *    ["A", "B", "C"]    -> "A, B e C"
 *  Pula vazios. */
function listSentence(items) {
  const filtered = (items || []).filter(Boolean);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} e ${filtered[1]}`;
  const head = filtered.slice(0, -1).join(", ");
  return `${head} e ${filtered[filtered.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Banco de variacoes por intent
// ---------------------------------------------------------------------------

// Cada variacao e uma funcao (ctx) -> string. Funcoes (em vez de
// strings com placeholders) permitem logica condicional natural:
// omitir frases quando dados faltam, juntar pedacos de forma fluida,
// adaptar pelo regiao/volume.
//
// Convencao do contexto:
//   ctx.primeiroNome              "Rick"
//   ctx.cidadeProdutor            "Manhuaçu" (normalizada)
//   ctx.corregoProdutor           "Córrego do Patrimônio" (opcional)
//   ctx.volumeFmt                 "200 a 500 sacas" (formatado)
//   ctx.tipoCafeFmt               "arábica especial" (formatado)
//   ctx.regiao                    "zona_mata" | "sul_minas" | ...
//   ctx.altaPrioridade            true se volume > 200 sacas
//   ctx.nomeCorretora             "Café Top Corretora"
//   ctx.nomeCorretor              "Pedro Henrique" (opcional)
//   ctx.saudacao                  "Bom dia" / "Boa tarde" / "Boa noite"
//   ctx.numeroContrato            "12345"
//   ctx.valorPropostaFmt          "R$ 1.250,00"
//   ctx.condicaoPagamento         "30 dias após coleta"

const VARIATIONS = {
  // ─── Primeiro contato da corretora com o produtor (WhatsApp) ───────────
  // Disparado quando produtor envia interesse via Kavita e corretora
  // tem janela de 24h para responder. Tom: comprador experiente da
  // regiao, curto, direto, sem "robo".
  corretora_primeiro_contato_produtor: [
    (ctx) => {
      const linha1 = `${ctx.saudacao} ${ctx.primeiroNome}, tudo certo?`;
      const interesse = ctx.cidadeProdutor
        ? `Vi seu contato pelo Kavita e fiquei interessado no seu café aí de ${ctx.cidadeProdutor}.`
        : "Vi seu contato pelo Kavita e fiquei interessado no seu café.";
      const fechamento = ctx.volumeFmt
        ? `Você está com ${ctx.volumeFmt} disponíveis hoje?`
        : "Quantas sacas você tem com previsão de venda?";
      return `${linha1}\n${interesse}\nDependendo da bebida e peneira talvez consigamos montar uma parceria boa.\n${fechamento}`;
    },
    (ctx) => {
      const intro = ctx.regiao === "zona_mata"
        ? `${ctx.saudacao} ${ctx.primeiroNome}.\nSou comprador aqui da região e vi seu anúncio no Kavita.`
        : `${ctx.saudacao} ${ctx.primeiroNome}.\nSou comprador da ${ctx.nomeCorretora || "Kavita"} e vi seu interesse pelo café.`;
      const cta = "Se quiser, conseguimos avaliar sua amostra ainda essa semana.";
      return `${intro}\n${cta}`;
    },
    (ctx) => {
      const observacao = ctx.regiao === "zona_mata"
        ? "Pela sua região normalmente aparece café muito bom."
        : "Café da sua região normalmente tem boa procura.";
      const bridge = "Se tiver interesse consigo alinhar coleta da amostra sem muita burocracia.";
      return `${ctx.primeiroNome}, ${observacao}\n${bridge}`;
    },
    (ctx) => {
      const cumpr = `${ctx.saudacao}, ${ctx.primeiroNome}.`;
      const pergunta = ctx.tipoCafeFmt
        ? `Vi que você tem ${ctx.tipoCafeFmt} disponível${ctx.cidadeProdutor ? ` em ${ctx.cidadeProdutor}` : ""}.`
        : "Recebi seu contato pelo Kavita.";
      const cta = "Quando dá pra você passar uma amostra ou os dados do lote? A gente analisa rápido e te retorna com proposta.";
      return `${cumpr}\n${pergunta}\n${cta}`;
    },
  ],

  // ─── Notificacao a corretora: novo lead chegou ─────────────────────────
  // Disparado quando produtor preenche formulario publico. Tom: alerta
  // util, direto ao ponto, sem repetir corporativismo.
  corretora_novo_lead_recebido: [
    (ctx) => {
      const head = ctx.altaPrioridade
        ? `Lead com volume alto: ${ctx.primeiroNome || "produtor"}`
        : `Novo contato: ${ctx.primeiroNome || "produtor"}`;
      const detalhes = listSentence([
        ctx.cidadeProdutor,
        ctx.tipoCafeFmt,
        ctx.volumeFmt,
      ]);
      const corpo = detalhes
        ? `${detalhes}.\nResponder rápido aumenta muito a chance de fechar.`
        : "Abra o lead e responda hoje — quem chama primeiro fica com o lote.";
      return `${head}.\n${corpo}`;
    },
    (ctx) => {
      const onde = ctx.cidadeProdutor ? ` de ${ctx.cidadeProdutor}` : "";
      const head = `Produtor${onde} quer falar com a ${ctx.nomeCorretora || "corretora"}.`;
      const meta = listSentence([ctx.tipoCafeFmt, ctx.volumeFmt]);
      const tail = meta
        ? `${meta}. Responder no mesmo dia já dobra a taxa de resposta.`
        : "Abra agora e mande um WhatsApp — vale mais que e-mail.";
      return `${head}\n${tail}`;
    },
  ],

  // ─── Confirmacao ao produtor: lead foi recebido pela corretora ─────────
  // Email curto, humano, sem parecer carta corporativa.
  produtor_lead_recebido: [
    (ctx) => {
      const linha = `${ctx.saudacao}, ${ctx.primeiroNome || "tudo bem"}.`;
      const meio = `Sua mensagem chegou na ${ctx.nomeCorretora || "corretora"}.`;
      const explica = ctx.regiao === "zona_mata"
        ? "A corretora costuma retornar no mesmo dia útil — produtor da Zona da Mata é prioridade aqui."
        : "Normalmente o retorno chega no mesmo dia útil.";
      return `${linha}\n${meio}\n${explica}\nSe não ouvir nada em 1 dia útil, responde este e-mail que a curadoria Kavita destrava a conversa.`;
    },
    (ctx) => {
      const linha = `Olá, ${ctx.primeiroNome || "produtor"}.`;
      const meio = `Recebemos sua mensagem para a ${ctx.nomeCorretora || "corretora"} pelo Kavita.`;
      const explica = "A corretora foi avisada agora e deve te chamar pelo canal que você escolheu (WhatsApp ou telefone).";
      return `${linha}\n${meio}\n${explica}\nQualquer demora, é só responder este e-mail — a gente acompanha.`;
    },
  ],

  // ─── SMS curto para produtor: corretora marcou contato ─────────────────
  // Limite de 160 chars para nao virar 2 SMS. Sem URL para nao
  // disparar filtro anti-spam de operadora.
  produtor_sms_contacted: [
    (ctx) =>
      `Oi ${ctx.primeiroNome || "tudo certo"}, a ${ctx.nomeCorretora || "corretora"} recebeu seu contato no Kavita e vai te chamar em breve.`,
    (ctx) =>
      `${ctx.primeiroNome || "Olá"}, ${ctx.nomeCorretora || "a corretora"} já viu seu interesse pelo Kavita. Aguarda o contato dela hoje.`,
    (ctx) =>
      `${ctx.primeiroNome || "Tudo bem"}? ${ctx.nomeCorretora || "A corretora"} foi avisada do seu interesse pelo Kavita - retorno chega já já.`,
  ],

  // ─── Follow-up 7 dias: pedido de avaliacao ─────────────────────────────
  // Tom: leve, sem cobrar, deixa claro que e' opcional. Foco em ajudar
  // outros produtores da regiao a escolher.
  produtor_followup_7d: [
    (ctx) => {
      const linha = `${ctx.saudacao}, ${ctx.primeiroNome || "tudo bem"}?`;
      const meio = `Faz uns dias que você falou com a ${ctx.nomeCorretora || "corretora"} pelo Kavita.`;
      const cta = "Se puder deixar uma avaliação rápida (1 minuto), ajuda outros produtores da região a escolher e a corretora a melhorar o atendimento.";
      return `${linha}\n${meio}\n${cta}`;
    },
    (ctx) => {
      const linha = `${ctx.primeiroNome || "Produtor"}, tudo certo?`;
      const meio = `Como foi o contato com a ${ctx.nomeCorretora || "corretora"}?`;
      const cta = "Se tiver 1 minuto, sua avaliação no Kavita ajuda quem está procurando comprador na sua região.";
      return `${linha}\n${meio}\n${cta}`;
    },
  ],

  // ─── Lembrete leads parados (admin -> corretora) ───────────────────────
  produtor_proposta_enviada: [
    (ctx) => {
      const intro = `Olá, ${ctx.primeiroNome || "produtor"}.`;
      const main = `A ${ctx.nomeCorretora || "corretora"} registrou uma proposta para sua negociação.`;
      const detalhes = listSentence([
        ctx.volumeFmt && `Volume ${ctx.volumeFmt}`,
        ctx.valorPropostaFmt && `Valor ${ctx.valorPropostaFmt}`,
        ctx.condicaoPagamento && `Pagamento ${ctx.condicaoPagamento}`,
      ]);
      const corpo = detalhes ? `Resumo: ${detalhes}.` : "";
      return `${intro}\n${main}${corpo ? "\n" + corpo : ""}\nFala com a corretora pra confirmar os detalhes antes de fechar.`;
    },
  ],

  // ─── Contrato gerado / em assinatura / assinado ────────────────────────
  produtor_contrato_gerado: [
    (ctx) => {
      const head = `${ctx.primeiroNome || "Olá"}, o contrato da sua negociação foi gerado no Kavita.`;
      const meta = listSentence([
        ctx.numeroContrato && `Contrato ${ctx.numeroContrato}`,
        ctx.nomeCorretora && `Corretora ${ctx.nomeCorretora}`,
        ctx.volumeFmt && `Volume ${ctx.volumeFmt}`,
      ]);
      const tail = "Confere as informações com calma antes de assinar — qualquer dúvida fala com a corretora ou responde este aviso.";
      return `${head}${meta ? "\n" + meta + "." : ""}\n${tail}`;
    },
  ],

  produtor_contrato_pendente_assinatura: [
    (ctx) => {
      const head = `${ctx.primeiroNome || "Olá"}, o contrato${ctx.numeroContrato ? " " + ctx.numeroContrato : ""} ainda está esperando sua assinatura.`;
      const meta = listSentence([
        ctx.nomeCorretora && `Corretora ${ctx.nomeCorretora}`,
        ctx.volumeFmt && `Volume ${ctx.volumeFmt}`,
      ]);
      const tail = "Acessa o link que a corretora mandou ou chama ela direto pra finalizar.";
      return `${head}${meta ? "\n" + meta + "." : ""}\n${tail}`;
    },
  ],

  produtor_contrato_assinado: [
    (ctx) => {
      const head = `${ctx.primeiroNome || "Olá"}, contrato${ctx.numeroContrato ? " " + ctx.numeroContrato : ""} assinado.`;
      const meta = listSentence([
        ctx.nomeCorretora && `Corretora ${ctx.nomeCorretora}`,
        ctx.volumeFmt && `Volume ${ctx.volumeFmt}`,
      ]);
      const tail = "Guarda o número pra acompanhar a coleta e o pagamento.";
      return `${head}${meta ? "\n" + meta + "." : ""}\n${tail}`;
    },
  ],

  // ─── Lembrete: produtor com atendimento aberto ─────────────────────────
  produtor_lembrete_retorno: [
    (ctx) => {
      const head = `${ctx.primeiroNome || "Olá"}, tudo certo?`;
      const meio = `Você tem um atendimento aberto com a ${ctx.nomeCorretora || "corretora"} pelo Kavita.`;
      const cta = "Se ainda quer vender, responde a corretora ou abre o atendimento. Se já fechou em outro lugar, é só avisar pra gente liberar a mesa de amostras.";
      return `${head}\n${meio}\n${cta}`;
    },
  ],
};

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------

/**
 * Monta o contexto humanizado a partir de objetos brutos (lead +
 * corretora). Aplica todos os normalizadores. Campos faltantes ficam
 * undefined — variantes lidam com isso.
 *
 * @param {Object} input
 * @param {Object} [input.lead]          row de corretora_leads
 * @param {Object} [input.corretora]     row de corretoras
 * @param {Object} [input.contrato]      row de contratos (opcional)
 * @param {Object} [input.proposta]      campos de proposta (opcional)
 * @param {Date}   [input.now]           timestamp pra saudacao
 * @returns {Object} contexto pronto pra injetar nas variantes
 */
function buildContext({ lead, corretora, contrato, proposta, now } = {}) {
  const ctx = {};
  ctx.saudacao = saudacao(now || new Date());

  if (lead) {
    ctx.primeiroNome = firstName(lead.nome);
    ctx.cidadeProdutor = normalizeCidade(lead.cidade);
    ctx.corregoProdutor = normalizeCorrego(lead.corrego_localidade);
    ctx.volumeFmt = formatVolume(lead.volume_range || lead.volume);
    ctx.tipoCafeFmt = formatTipoCafe(lead.tipo_cafe);
    ctx.regiao = detectRegiao(ctx.cidadeProdutor);
    // Volume alto = decisao comercial, ajuda a escolher copy mais firme
    ctx.altaPrioridade = ["200_500", "500_mais"].includes(
      String(lead.volume_range || ""),
    );
    ctx.leadId = lead.id; // seed pro pickVariation

    // Intel regional: microrregiao, altitude, qualidade tipica,
    // vocabulario local, contexto de mercado. Variantes premium/
    // regional usam pra demonstrar conhecimento real.
    if (_regional && ctx.cidadeProdutor) {
      ctx.intel = _regional.getRegionalIntel(ctx.cidadeProdutor);
    }
  }

  if (corretora) {
    ctx.nomeCorretora = corretora.name || corretora.nome || null;
    ctx.nomeCorretor = corretora.contact_name || null;
    ctx.corretoraId = corretora.id;
    // Estilo de comunicacao da corretora — opcional. Se ausente,
    // humanize cai nas variantes genericas.
    ctx.communicationStyle =
      corretora.communication_style || corretora.communicationStyle || null;
  }

  if (contrato) {
    ctx.numeroContrato = contrato.id ? String(contrato.id) : null;
  }

  if (proposta) {
    ctx.valorPropostaFmt = formatValor(proposta.valor_cents ?? proposta.valor);
    ctx.condicaoPagamento = proposta.condicao || null;
  }

  return ctx;
}

/** Formata valor monetario em R$ a partir de centavos ou numero. */
function formatValor(valor) {
  if (valor == null) return null;
  const cents = Number(valor);
  if (!Number.isFinite(cents)) return null;
  // Se valor parece ja vir em reais (decimal), nao multiplica.
  const valorReal = Number.isInteger(cents) && cents > 1000 ? cents / 100 : cents;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(valorReal);
  } catch {
    return `R$ ${valorReal.toFixed(2).replace(".", ",")}`;
  }
}

/**
 * Retorna o texto de uma mensagem ja humanizada para o intent dado.
 *
 * Variantes sao escolhidas deterministicamente a partir de um seed
 * (lead.id ou corretora.id por default) — mesmo lead recebe sempre a
 * mesma variante, mas leads diferentes recebem versoes diferentes.
 * Isso evita que dois produtores com mesmo perfil recebam mensagens
 * identicas (impressao de "robo enviando em massa").
 *
 * @param {string} intent  chave em VARIATIONS (ex: "corretora_primeiro_contato_produtor")
 * @param {Object} ctx     contexto montado por buildContext()
 * @param {Object} [opts]
 * @param {number|string} [opts.seed]  seed para pickVariation (default: ctx.leadId || ctx.corretoraId)
 * @returns {string|null}  texto final, ou null se intent desconhecido
 */
function humanize(intent, ctx, opts = {}) {
  // 1. Estilo da corretora (premium/agressivo/etc) tem prioridade —
  //    variantes do estilo sobrescrevem o banco generico para o intent.
  let variations = null;
  const style = opts.communicationStyle || ctx.communicationStyle;
  if (style && _styles) {
    variations = _styles.getStyleVariants(style, intent);
  }
  // 2. Fallback para banco generico
  if (!variations || variations.length === 0) {
    variations = VARIATIONS[intent];
  }
  if (!variations) return null;

  const seed = opts.seed ?? ctx.leadId ?? ctx.corretoraId ?? null;
  const variant = pickVariation(variations, seed);
  if (typeof variant !== "function") return null;
  let text;
  try {
    text = variant(ctx) || "";
  } catch {
    text = "";
  }
  // Limpeza final: remove duplicacao de espacos, linhas vazias
  // duplas, e espacos antes de pontuacao.
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Versao que ja monta contexto + humaniza em uma chamada — atalho
 *  comum para callers que so tem lead/corretora em maos. */
function humanizeForLead(intent, { lead, corretora, contrato, proposta, now } = {}, opts = {}) {
  const ctx = buildContext({ lead, corretora, contrato, proposta, now });
  return humanize(intent, ctx, opts);
}

module.exports = {
  // engine
  buildContext,
  humanize,
  humanizeForLead,
  // helpers expostos para testes / reuso
  firstName,
  normalizeCidade,
  normalizeCorrego,
  formatVolume,
  formatTipoCafe,
  formatValor,
  saudacao,
  detectRegiao,
  pickVariation,
  deterministicIndex,
  joinNonEmpty,
  listSentence,
  // expor para reuse em testes
  VARIATIONS,
};
