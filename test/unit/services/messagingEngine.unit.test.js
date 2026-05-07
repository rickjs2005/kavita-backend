"use strict";

// Tests dos modulos auxiliares do messaging engine premium:
//   regionalContext, communicationStyles, messageHumanScore,
//   messageSequencer + integracao com humanMessageBuilder.

const regional = require("../../../services/messaging/regionalContext");
const styles = require("../../../services/messaging/communicationStyles");
const score = require("../../../services/messaging/messageHumanScore");
const sequencer = require("../../../services/messaging/messageSequencer");
const humanizer = require("../../../services/messaging/humanMessageBuilder");

// ─── regionalContext ────────────────────────────────────────────────────

describe("regionalContext.getRegionalIntel", () => {
  test("identifica microrregiao Manhuaçu", () => {
    const intel = regional.getRegionalIntel("Manhuaçu");
    expect(intel.region).toBe("zona_mata");
    expect(intel.microrregiao).toBe("Manhuaçu");
    expect(intel.altitudeMedia).toBeGreaterThan(700);
    expect(intel.vocabularioLocal).toEqual(expect.arrayContaining(["lote", "bebida"]));
    expect(intel.contextoMercado.length).toBeGreaterThan(0);
  });

  test("identifica Sul de Minas — Varginha", () => {
    const intel = regional.getRegionalIntel("Varginha");
    expect(intel.region).toBe("sul_minas");
    expect(intel.perfilComercial).toEqual(expect.arrayContaining(["exportacao_grande"]));
  });

  test("identifica Cerrado", () => {
    const intel = regional.getRegionalIntel("Patrocínio");
    expect(intel.region).toBe("cerrado");
  });

  test("retorna estrutura segura para cidade desconhecida", () => {
    const intel = regional.getRegionalIntel("Cidade Inventada");
    expect(intel.region).toBe("outro");
    expect(intel.microrregiao).toBeNull();
    expect(intel.contextoMercado).toEqual([]);
    expect(Array.isArray(intel.vocabularioLocal)).toBe(true);
  });

  test("retorna estrutura segura para input vazio/nulo", () => {
    expect(regional.getRegionalIntel(null).region).toBe("outro");
    expect(regional.getRegionalIntel("").region).toBe("outro");
  });
});

describe("regionalContext.getMarketSeason", () => {
  test("classifica safra (jun-set)", () => {
    expect(regional.getMarketSeason(new Date("2026-07-15"))).toBe("safra");
  });
  test("classifica entressafra (dez-fev)", () => {
    expect(regional.getMarketSeason(new Date("2026-01-15"))).toBe("entressafra");
  });
  test("classifica pre-safra (mar-mai)", () => {
    expect(regional.getMarketSeason(new Date("2026-04-15"))).toBe("pre_safra");
  });
  test("classifica pos-safra (out-nov)", () => {
    expect(regional.getMarketSeason(new Date("2026-10-15"))).toBe("pos_safra");
  });
});

describe("regionalContext.getMarketUrgencyHint", () => {
  test("inclui contexto regional + estacao", () => {
    const intel = regional.getRegionalIntel("Manhuaçu");
    const hints = regional.getMarketUrgencyHint(intel, new Date("2026-07-15"));
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
    // Inclui pelo menos uma frase regional
    expect(hints.some((h) => /Manhuaçu|região|peneira/i.test(h))).toBe(true);
  });
});

// ─── communicationStyles ────────────────────────────────────────────────

describe("communicationStyles", () => {
  test("listStyles retorna 6 estilos com metadata", () => {
    const list = styles.listStyles();
    expect(list.length).toBe(6);
    const keys = list.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "tradicional",
        "premium",
        "tecnico",
        "agressivo",
        "regional",
        "corporativo",
      ]),
    );
    for (const s of list) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });

  test("getStyleVariants retorna funcoes para intent conhecido", () => {
    const variants = styles.getStyleVariants("premium", "corretora_primeiro_contato_produtor");
    expect(Array.isArray(variants)).toBe(true);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(typeof variants[0]).toBe("function");
  });

  test("getStyleVariants retorna null para intent sem variante", () => {
    const variants = styles.getStyleVariants("tradicional", "intent_inexistente");
    expect(variants).toBeNull();
  });

  test("getStyleMeta retorna null para estilo desconhecido", () => {
    expect(styles.getStyleMeta("nao_existe")).toBeNull();
  });

  test("variantes premium mencionam bebida/exportação/prêmio", () => {
    const ctx = humanizer.buildContext({
      lead: { id: 1, nome: "Rick", cidade: "Manhuaçu", volume_range: "200_500" },
      corretora: { id: 1, name: "Test", communication_style: "premium" },
    });
    const text = humanizer.humanize("corretora_primeiro_contato_produtor", ctx);
    expect(text).toMatch(/bebida|prêmio|exportação|microlote/i);
  });

  test("variantes agressivo são curtas e diretas", () => {
    const ctx = humanizer.buildContext({
      lead: { id: 5, nome: "Rick", cidade: "Manhuaçu", volume_range: "200_500" },
      corretora: { id: 1, name: "Test", communication_style: "agressivo" },
    });
    const text = humanizer.humanize("corretora_primeiro_contato_produtor", ctx);
    // Agressivo: < 200 chars, mensagem direta
    expect(text.length).toBeLessThan(250);
    // Tom direto (palavras como hoje, agora, fechar, retorno)
    expect(text).toMatch(/hoje|agora|fech|retorno|firme/i);
  });

  test("variantes regional usam intel.microrregiao", () => {
    const ctx = humanizer.buildContext({
      lead: { id: 9, nome: "Rick", cidade: "Manhuaçu" },
      corretora: { id: 1, name: "Test", communication_style: "regional" },
    });
    const text = humanizer.humanize("corretora_primeiro_contato_produtor", ctx);
    expect(text).toMatch(/Manhuaçu|região/i);
  });
});

// ─── messageHumanScore ──────────────────────────────────────────────────

describe("messageHumanScore.score", () => {
  test("texto humano normal score >= 80", () => {
    const text = "Bom dia Rick, tudo certo? Vi seu contato pelo Kavita e fiquei interessado.";
    const r = score.score(text, { firstContact: true });
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  test("texto vazio retorna score 0", () => {
    const r = score.score("");
    expect(r.score).toBe(0);
    expect(r.issues[0].code).toBe("empty");
  });

  test("detecta marcador de template", () => {
    const text = "Olá Rick. Mensagem automática do Kavita.";
    const r = score.score(text);
    expect(r.issues.some((i) => i.code === "template_marker")).toBe(true);
    expect(r.score).toBeLessThan(80);
  });

  test("detecta formalidade excessiva", () => {
    const text = "Prezado Rick, venho por meio desta informar sobre sua amostra.";
    const r = score.score(text);
    expect(r.issues.some((i) => i.code === "formal_phrase")).toBe(true);
  });

  test("detecta densidade de Kavita > 1 fora de primeiro contato", () => {
    const text = "Rick, abre o Kavita. No painel do Kavita você ve a proposta.";
    const r = score.score(text, { firstContact: false });
    expect(r.issues.some((i) => i.code === "platform_density")).toBe(true);
  });

  test("aceita 2 menções a Kavita em primeiro contato", () => {
    const text = "Rick, vi seu contato pelo Kavita. O Kavita conecta produtor e corretora.";
    const r = score.score(text, { firstContact: true });
    const platIssue = r.issues.find((i) => i.code === "platform_density");
    expect(platIssue).toBeUndefined();
  });

  test("detecta nome repetido > 2x", () => {
    const text = "Rick, tudo bem Rick? Manda amostra Rick, ai Rick a gente conversa Rick.";
    const r = score.score(text, { produtorNome: "Rick" });
    expect(r.issues.some((i) => i.code === "name_density")).toBe(true);
  });

  test("detecta texto longo > 4 paragrafos", () => {
    const text = Array.from({ length: 6 }, (_, i) => `Paragrafo ${i + 1}.`).join("\n\n");
    const r = score.score(text);
    expect(r.issues.some((i) => i.code === "too_long")).toBe(true);
  });

  test("detecta frases artificiais", () => {
    const text = "Olá Rick. Recebi seu interesse. Como posso ajudar?";
    const r = score.score(text);
    expect(r.issues.some((i) => i.code === "artificial_phrase")).toBe(true);
  });
});

describe("messageHumanScore.isAcceptable", () => {
  test("texto normal passa threshold default 60", () => {
    expect(score.isAcceptable("Bom dia, tudo bem?")).toBe(true);
  });

  test("texto com marcador de template falha", () => {
    expect(score.isAcceptable("Mensagem automática do Kavita.")).toBe(false);
  });

  test("threshold customizavel", () => {
    const text = "Olá Rick. Mensagem automática.";
    expect(score.isAcceptable(text, { threshold: 95 })).toBe(false);
    expect(score.isAcceptable(text, { threshold: 30 })).toBe(true);
  });
});

// ─── messageSequencer ──────────────────────────────────────────────────

describe("messageSequencer.splitIntoBursts", () => {
  test("retorna array vazio para texto vazio", () => {
    expect(sequencer.splitIntoBursts("")).toEqual([]);
    expect(sequencer.splitIntoBursts("   ")).toEqual([]);
    expect(sequencer.splitIntoBursts(null)).toEqual([]);
  });

  test("texto curto vira 1 burst", () => {
    const bursts = sequencer.splitIntoBursts("Bom dia Rick.");
    expect(bursts.length).toBe(1);
    expect(bursts[0].text).toBe("Bom dia Rick.");
    expect(bursts[0].delayMs).toBe(0); // primeiro burst sem delay
  });

  test("paragrafos separados viram bursts diferentes", () => {
    const text = "Bom dia Rick.\n\nVi seu contato pelo Kavita.\n\nQuantas sacas você tem?";
    const bursts = sequencer.splitIntoBursts(text);
    expect(bursts.length).toBeGreaterThanOrEqual(2);
  });

  test("primeiro burst sempre com delay 0", () => {
    const bursts = sequencer.splitIntoBursts("Texto.\n\nOutro texto.");
    expect(bursts[0].delayMs).toBe(0);
  });

  test("delays subsequentes respeitam min/max", () => {
    const long = "A".repeat(500);
    const text = `${long}\n\n${long}\n\n${long}`;
    const bursts = sequencer.splitIntoBursts(text);
    for (let i = 1; i < bursts.length; i++) {
      expect(bursts[i].delayMs).toBeGreaterThanOrEqual(sequencer.MIN_DELAY_MS);
      expect(bursts[i].delayMs).toBeLessThanOrEqual(sequencer.MAX_DELAY_MS);
    }
  });

  test("paragrafo muito longo e quebrado em frases", () => {
    const longSentences =
      "Primeira frase muito muito muito muito muito longa para forçar split. " +
      "Segunda frase tambem muito muito muito muito muito longa para forcar. " +
      "Terceira frase muito muito muito muito muito longa para forcar. " +
      "Quarta frase para forcar mais um split aqui dentro do paragrafo.";
    const bursts = sequencer.splitIntoBursts(longSentences, { maxBurstChars: 80 });
    expect(bursts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("messageSequencer.computeTypingDelay", () => {
  test("delay proporcional ao tamanho", () => {
    const short = sequencer.computeTypingDelay("hi");
    const long = sequencer.computeTypingDelay("a".repeat(100));
    expect(long).toBeGreaterThan(short);
  });
});

// ─── humanizer integracao com style ────────────────────────────────────

describe("humanMessageBuilder integracao com communicationStyle", () => {
  test("tradicional vs premium produzem textos diferentes para mesmo lead", () => {
    const lead = { id: 1, nome: "Rick", cidade: "Manhuaçu", volume_range: "200_500" };

    const ctxTrad = humanizer.buildContext({
      lead,
      corretora: { id: 1, name: "Test", communication_style: "tradicional" },
    });
    const ctxPrem = humanizer.buildContext({
      lead,
      corretora: { id: 1, name: "Test", communication_style: "premium" },
    });

    const textTrad = humanizer.humanize("corretora_primeiro_contato_produtor", ctxTrad);
    const textPrem = humanizer.humanize("corretora_primeiro_contato_produtor", ctxPrem);

    expect(textTrad).not.toBe(textPrem);
  });

  test("intent sem variante de estilo cai no banco generico", () => {
    const ctx = humanizer.buildContext({
      lead: { id: 1, nome: "Rick" },
      corretora: { id: 1, name: "Test", communication_style: "tradicional" },
    });
    // produtor_followup_7d nao tem variante em styles — usa generico
    const text = humanizer.humanize("produtor_followup_7d", ctx);
    expect(text).toBeTruthy();
  });

  test("intel regional populado em ctx quando cidade conhecida", () => {
    const ctx = humanizer.buildContext({
      lead: { id: 1, nome: "Rick", cidade: "Manhuaçu" },
    });
    expect(ctx.intel).toBeDefined();
    expect(ctx.intel.microrregiao).toBe("Manhuaçu");
  });

  test("score >= 60 em todos os intents x estilos", () => {
    const lead = { id: 7, nome: "Rick", cidade: "Manhuaçu", volume_range: "200_500" };
    const intents = [
      "corretora_primeiro_contato_produtor",
      "produtor_lead_recebido",
      "produtor_sms_contacted",
      "produtor_followup_7d",
    ];
    const stylesToTest = [
      "tradicional",
      "premium",
      "tecnico",
      "agressivo",
      "regional",
      "corporativo",
    ];

    for (const intent of intents) {
      for (const styleKey of stylesToTest) {
        const ctx = humanizer.buildContext({
          lead,
          corretora: { id: 1, name: "Test", communication_style: styleKey },
        });
        const text = humanizer.humanize(intent, ctx);
        if (!text) continue;
        const r = score.score(text, {
          produtorNome: "Rick",
          cidade: "Manhuaçu",
          firstContact: intent.startsWith("corretora_primeiro"),
        });
        if (r.score < 60) {
          // log diagnostico — facilita debug se um estilo gerar copy ruim
           
          console.warn(
            `Score baixo: intent=${intent} style=${styleKey} score=${r.score}`,
            r.issues,
          );
        }
        expect(r.score).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
