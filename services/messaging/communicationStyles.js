"use strict";

// services/messaging/communicationStyles.js
//
// Personalidade comercial por corretora. Cada corretora declara um
// `communication_style` (coluna em corretoras) que muda fundamentalmente
// o tom das mensagens automatizadas:
//
//   tradicional  — comprador antigo, conservador, voce/senhor, calmo
//   premium      — exportador especial, foco em bebida e prêmio
//   tecnico      — fala em peneira/cup score/granulometria
//   agressivo    — vai direto ao ponto, urgência, fechamento rápido
//   regional     — usa fortemente vocabulario local da micro
//   corporativo  — formal, polido, processo, exportacao grande
//
// Cada estilo expõe variantes proprias para os intents. O humanizer
// procura primeiro em STYLES[style].variations[intent]; se nao houver
// variante especifica do estilo, cai no banco generico de
// humanMessageBuilder.VARIATIONS.

/** Helper local: lista pt-br "A, B e C" filtrando vazios. */
function listSentence(items) {
  const filtered = (items || []).filter(Boolean);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} e ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")} e ${filtered[filtered.length - 1]}`;
}

// ─── tradicional ─────────────────────────────────────────────────────────
// Tom conservador, calmo, voce/senhor, sem urgencia agressiva. Comprador
// antigo que constroi relacao de longo prazo.
const TRADICIONAL = {
  name: "Tradicional",
  description: "Comprador antigo da região, calmo, foco em relação de longo prazo.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) =>
        `${ctx.saudacao}, ${ctx.primeiroNome}. Tudo bem?\n` +
        `${ctx.cidadeProdutor ? `Vi seu contato aí de ${ctx.cidadeProdutor}.` : "Vi seu contato pelo Kavita."} ` +
        "Conseguimos avaliar sua amostra essa semana, sem pressa.",
      (ctx) =>
        `${ctx.saudacao} ${ctx.primeiroNome}.\n` +
        "Trabalho com café aqui na região faz tempo. " +
        "Se você quiser conversar sobre o lote, tô à disposição.",
      (ctx) =>
        `${ctx.primeiroNome}, ${ctx.saudacao.toLowerCase()}.\n` +
        `${ctx.intel?.destaque ? `Café da sua região costuma ter ${ctx.intel.destaque}. ` : ""}` +
        "Quando der uma passada com a amostra a gente conversa.",
    ],
  },
};

// ─── premium ─────────────────────────────────────────────────────────────
// Foco em bebida, peneira alta, exportacao especial, premiacao. Demonstra
// conhecimento tecnico e comercial avancado.
const PREMIUM = {
  name: "Premium",
  description: "Exportador de café especial. Foco em bebida, peneira alta, prêmio.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) => {
        const intelLine = ctx.intel?.destaque
          ? `Café da ${ctx.intel.microrregiao || ctx.cidadeProdutor || "sua região"} costuma render ${ctx.intel.destaque}. `
          : "";
        return (
          `${ctx.saudacao} ${ctx.primeiroNome}, tudo bem?\n` +
          intelLine +
          "Dependendo da bebida talvez consigamos um prêmio interessante nesse lote."
        );
      },
      (ctx) =>
        `${ctx.saudacao} ${ctx.primeiroNome}.\n` +
        "Trabalho com café especial pra exportação. " +
        `${ctx.cidadeProdutor ? `Lote de ${ctx.cidadeProdutor} ` : "Seu lote "}` +
        "pode ter espaço de prêmio se a bebida favorecer.",
      (ctx) =>
        `${ctx.primeiroNome}, ${ctx.saudacao.toLowerCase()}.\n` +
        "Tô puxando microlote nessa janela. Se sua amostra tiver bebida acima de 84, conseguimos um patamar bom.",
    ],
    corretora_novo_lead_recebido: [
      (ctx) => {
        const detalhes = listSentence([
          ctx.cidadeProdutor,
          ctx.tipoCafeFmt,
          ctx.volumeFmt,
        ]);
        return (
          `Lead com perfil para microlote: ${ctx.primeiroNome || "produtor"}.\n` +
          (detalhes ? `${detalhes}.` : "") +
          " Vale puxar amostra rápido — exportador anda fechando bebida boa essa semana."
        );
      },
    ],
  },
};

// ─── tecnico ─────────────────────────────────────────────────────────────
// Vocabulario tecnico: peneira, cup score, fermentacao, natural, honey,
// despolpado, pulped natural. Fala como classificador.
const TECNICO = {
  name: "Técnico",
  description: "Vocabulário de classificador: peneira, cup score, fermentação.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) =>
        `${ctx.saudacao}, ${ctx.primeiroNome}.\n` +
        "Trabalho com classificação aqui. " +
        `${ctx.cidadeProdutor ? `${ctx.cidadeProdutor} ` : "Sua região "}` +
        "costuma render bebida boa. Se mandar amostra de 300g consigo te passar peneira e cup score em 48h.",
      (ctx) =>
        `${ctx.primeiroNome}, ${ctx.saudacao.toLowerCase()}.\n` +
        "Se o lote estiver com peneira 16/18 acima de 70% e bebida dura, conseguimos negociar com diferencial. Tem amostra recente?",
    ],
  },
};

// ─── agressivo ───────────────────────────────────────────────────────────
// Foco em fechamento rapido, urgencia, retorno hoje. Sem floreio.
const AGRESSIVO = {
  name: "Agressivo",
  description: "Direto, sem floreio. Urgência, fechamento hoje.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) =>
        `${ctx.primeiroNome}, vi seu lote no Kavita.\n` +
        "Se estiver com café pronto consigo te dar retorno ainda hoje. " +
        `${ctx.volumeFmt ? `Confirma ${ctx.volumeFmt}?` : "Quantas sacas?"}`,
      (ctx) =>
        `${ctx.primeiroNome}, ${ctx.saudacao.toLowerCase()}.\n` +
        "Tô fechando lote essa semana. " +
        `${ctx.cidadeProdutor ? `Café de ${ctx.cidadeProdutor} entra bem. ` : ""}` +
        "Manda amostra hoje que retorno preço amanhã.",
      (ctx) =>
        `${ctx.primeiroNome}.\n` +
        "Mercado abriu firme. Se tiver lote pronto com bebida boa fecho rápido.\n" +
        "Quantas sacas e qual safra?",
    ],
    corretora_novo_lead_recebido: [
      (ctx) => {
        const detalhes = listSentence([
          ctx.cidadeProdutor,
          ctx.tipoCafeFmt,
          ctx.volumeFmt,
        ]);
        return (
          `Lead quente: ${ctx.primeiroNome || "produtor"}.\n` +
          (detalhes ? `${detalhes}.` : "") +
          " Liga agora. Quem chama em 30min fecha; quem demora perde."
        );
      },
    ],
  },
};

// ─── regional ────────────────────────────────────────────────────────────
// Usa fortemente vocabulario local. "Café da roça", "tulha", "lote bom".
// Tom de quem conhece a microrregiao de pertinho.
const REGIONAL = {
  name: "Regional",
  description: "Conhece a microrregião pessoalmente. Vocabulário local.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) => {
        const lugar = ctx.intel?.microrregiao || ctx.cidadeProdutor || "região";
        return (
          `${ctx.saudacao} ${ctx.primeiroNome}.\n` +
          `Sou ${ctx.intel?.epitetoComprador || "comprador"} aqui da ${lugar}. ` +
          "Se quiser, dá pra eu passar na sua tulha pegar amostra essa semana."
        );
      },
      (ctx) =>
        `${ctx.primeiroNome}, ${ctx.saudacao.toLowerCase()}.\n` +
        `Tô comprando café aqui na ${ctx.intel?.microrregiao || ctx.cidadeProdutor || "região"} faz tempo. ` +
        "Se for café da roça em estoque ou cereja já beneficiada, dá pra fechar rápido.",
      (ctx) =>
        `${ctx.primeiroNome}.\n` +
        `Café de ${ctx.intel?.microrregiao || ctx.cidadeProdutor || "aqui"} costuma render bem. ` +
        `Manda umas 300g de amostra que ${ctx.saudacao === "Boa noite" ? "amanhã" : "hoje à tarde"} te passo posição.`,
    ],
  },
};

// ─── corporativo ─────────────────────────────────────────────────────────
// Tom polido e formal. Empresa estabelecida. Processo claro.
const CORPORATIVO = {
  name: "Corporativo",
  description: "Empresa estabelecida com processo. Tom polido sem ser frio.",
  variations: {
    corretora_primeiro_contato_produtor: [
      (ctx) =>
        `${ctx.saudacao}, ${ctx.primeiroNome}.\n` +
        `${ctx.nomeCorretora ? `Sou da ${ctx.nomeCorretora}. ` : ""}` +
        "Recebemos seu interesse e vou te passar o caminho da nossa avaliação: amostra de 300g, prazo de retorno em até 48h. " +
        "Pode mandar pelo correio ou eu busco se for próximo.",
      (ctx) =>
        `${ctx.saudacao} ${ctx.primeiroNome}.\n` +
        "Trabalhamos com volume firme essa janela. " +
        "Se conseguir alinhar uma amostra, conseguimos te dar uma posição comercial em poucos dias.",
    ],
  },
};

const STYLES = {
  tradicional: TRADICIONAL,
  premium: PREMIUM,
  tecnico: TECNICO,
  agressivo: AGRESSIVO,
  regional: REGIONAL,
  corporativo: CORPORATIVO,
};

/**
 * Retorna metadata de um estilo (nome, description). Usado pela UI
 * admin pra exibir opcoes de configuracao.
 */
function getStyleMeta(styleKey) {
  const s = STYLES[styleKey];
  if (!s) return null;
  return { key: styleKey, name: s.name, description: s.description };
}

function listStyles() {
  return Object.keys(STYLES).map((k) => getStyleMeta(k));
}

/**
 * Retorna as variantes especificas de um estilo para um intent. Se
 * nao houver variantes, retorna null — caller usa o fallback generico.
 *
 * @param {string} styleKey
 * @param {string} intent
 * @returns {Array<Function>|null}
 */
function getStyleVariants(styleKey, intent) {
  const s = STYLES[styleKey];
  if (!s) return null;
  const variants = s.variations?.[intent];
  if (!Array.isArray(variants) || variants.length === 0) return null;
  return variants;
}

module.exports = {
  STYLES,
  listStyles,
  getStyleMeta,
  getStyleVariants,
};
