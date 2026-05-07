"use strict";

const {
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
  buildContext,
  humanize,
  humanizeForLead,
  VARIATIONS,
} = require("../../../services/messaging/humanMessageBuilder");

describe("humanMessageBuilder · normalizadores", () => {
  describe("firstName", () => {
    test("extrai e capitaliza primeiro nome", () => {
      expect(firstName("RICK JANUARIO DA SILVA")).toBe("Rick");
      expect(firstName("joão pedro")).toBe("João");
      expect(firstName("Maria")).toBe("Maria");
    });

    test("retorna null para entrada vazia ou inválida", () => {
      expect(firstName("")).toBeNull();
      expect(firstName(null)).toBeNull();
      expect(firstName(undefined)).toBeNull();
      expect(firstName(123)).toBeNull();
    });
  });

  describe("normalizeCidade", () => {
    test("capitaliza preservando preposicoes minusculas", () => {
      expect(normalizeCidade("santa rita do sapucaí")).toBe(
        "Santa Rita do Sapucaí",
      );
      expect(normalizeCidade("MANHUAÇU")).toBe("Manhuaçu");
      expect(normalizeCidade("são joão da boa vista")).toBe(
        "São João da Boa Vista",
      );
    });

    test("retorna null para entrada vazia", () => {
      expect(normalizeCidade("")).toBeNull();
      expect(normalizeCidade("   ")).toBeNull();
      expect(normalizeCidade(null)).toBeNull();
    });
  });

  describe("normalizeCorrego", () => {
    test("aplica mesma logica de cidade", () => {
      expect(normalizeCorrego("CÓRREGO DO PATRIMÔNIO")).toBe(
        "Córrego do Patrimônio",
      );
    });
  });

  describe("formatVolume", () => {
    test("traduz ranges padrao do dropdown", () => {
      expect(formatVolume("ate_50")).toBe("até 50 sacas");
      expect(formatVolume("50_200")).toBe("50 a 200 sacas");
      expect(formatVolume("200_500")).toBe("200 a 500 sacas");
      expect(formatVolume("500_mais")).toBe("acima de 500 sacas");
    });

    test("aceita numero puro", () => {
      expect(formatVolume(250)).toBe("250 sacas");
      expect(formatVolume("100")).toBe("100 sacas");
    });

    test("retorna null para vazio/nulo", () => {
      expect(formatVolume(null)).toBeNull();
      expect(formatVolume("")).toBeNull();
      expect(formatVolume(undefined)).toBeNull();
    });

    test("retorna texto livre se ja vier formatado", () => {
      expect(formatVolume("entre 100 e 200")).toBe("entre 100 e 200");
    });
  });

  describe("formatTipoCafe", () => {
    test("mapeia codigos para texto natural", () => {
      expect(formatTipoCafe("arabica")).toBe("arábica");
      expect(formatTipoCafe("arabica_especial")).toBe("arábica especial");
      expect(formatTipoCafe("conilon")).toBe("conilon");
      expect(formatTipoCafe("cereja_descascado")).toBe("cereja descascado");
    });

    test("fallback substitui underscore por espaco", () => {
      expect(formatTipoCafe("tipo_desconhecido")).toBe("tipo desconhecido");
    });

    test("retorna null para entrada vazia", () => {
      expect(formatTipoCafe(null)).toBeNull();
      expect(formatTipoCafe("")).toBeNull();
    });
  });

  describe("formatValor", () => {
    test("formata valor em centavos como BRL", () => {
      // 125000 cents = R$ 1.250,00
      expect(formatValor(125000)).toMatch(/R\$\s?1\.250,00/);
    });

    test("formata valor em reais (decimal) sem dividir por 100", () => {
      expect(formatValor(150)).toMatch(/R\$\s?150,00/);
    });

    test("retorna null para entrada invalida", () => {
      expect(formatValor(null)).toBeNull();
      expect(formatValor(undefined)).toBeNull();
      expect(formatValor("abc")).toBeNull();
    });
  });

  describe("saudacao", () => {
    test("escolhe pelo horario local", () => {
      expect(saudacao(new Date("2026-05-08T08:00:00"))).toBe("Bom dia");
      expect(saudacao(new Date("2026-05-08T14:00:00"))).toBe("Boa tarde");
      expect(saudacao(new Date("2026-05-08T20:00:00"))).toBe("Boa noite");
      expect(saudacao(new Date("2026-05-08T03:00:00"))).toBe("Boa noite");
    });
  });

  describe("detectRegiao", () => {
    test("identifica Zona da Mata", () => {
      expect(detectRegiao("Manhuaçu")).toBe("zona_mata");
      expect(detectRegiao("Manhumirim")).toBe("zona_mata");
      expect(detectRegiao("Lajinha")).toBe("zona_mata");
    });

    test("identifica Sul de Minas", () => {
      expect(detectRegiao("Varginha")).toBe("sul_minas");
      expect(detectRegiao("Três Pontas")).toBe("sul_minas");
    });

    test("retorna 'outro' para cidades nao mapeadas", () => {
      expect(detectRegiao("Rio de Janeiro")).toBe("outro");
      expect(detectRegiao(null)).toBe("outro");
    });
  });
});

describe("humanMessageBuilder · pickVariation", () => {
  test("escolha deterministica com mesmo seed", () => {
    const arr = ["A", "B", "C", "D"];
    expect(pickVariation(arr, 42)).toBe(pickVariation(arr, 42));
    expect(pickVariation(arr, "lead-7")).toBe(pickVariation(arr, "lead-7"));
  });

  test("seeds diferentes produzem distribuicao", () => {
    const arr = ["A", "B", "C"];
    const picks = new Set();
    for (let i = 0; i < 50; i++) {
      picks.add(pickVariation(arr, i));
    }
    // Em 50 seeds diferentes deve cobrir mais de 1 variante.
    expect(picks.size).toBeGreaterThan(1);
  });

  test("array vazio retorna null", () => {
    expect(pickVariation([], 1)).toBeNull();
    expect(pickVariation(null, 1)).toBeNull();
  });

  test("array unitario sempre retorna o unico item", () => {
    expect(pickVariation(["only"], 1)).toBe("only");
  });
});

describe("humanMessageBuilder · deterministicIndex", () => {
  test("idempotente para mesmo seed/modulo", () => {
    expect(deterministicIndex("seed-1", 5)).toBe(
      deterministicIndex("seed-1", 5),
    );
  });

  test("respeita modulo", () => {
    for (let i = 0; i < 100; i++) {
      const idx = deterministicIndex(`seed-${i}`, 7);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(7);
    }
  });
});

describe("humanMessageBuilder · listSentence", () => {
  test("formata listas em portugues natural", () => {
    expect(listSentence(["A"])).toBe("A");
    expect(listSentence(["A", "B"])).toBe("A e B");
    expect(listSentence(["A", "B", "C"])).toBe("A, B e C");
  });

  test("filtra valores vazios", () => {
    expect(listSentence(["A", null, "B", "", undefined])).toBe("A e B");
    expect(listSentence([])).toBe("");
    expect(listSentence(null)).toBe("");
  });
});

describe("humanMessageBuilder · joinNonEmpty", () => {
  test("filtra vazios e junta com separador", () => {
    expect(joinNonEmpty(["A", null, "B"], " · ")).toBe("A · B");
    expect(joinNonEmpty([null, undefined, ""], " · ")).toBe("");
  });
});

describe("humanMessageBuilder · buildContext", () => {
  test("monta contexto a partir de lead + corretora", () => {
    const ctx = buildContext({
      lead: {
        id: 7,
        nome: "RICK JANUARIO",
        cidade: "MANHUAÇU",
        volume_range: "200_500",
        tipo_cafe: "arabica_especial",
      },
      corretora: { id: 3, name: "Café Top Corretora" },
      now: new Date("2026-05-08T09:00:00"),
    });
    expect(ctx.primeiroNome).toBe("Rick");
    expect(ctx.cidadeProdutor).toBe("Manhuaçu");
    expect(ctx.volumeFmt).toBe("200 a 500 sacas");
    expect(ctx.tipoCafeFmt).toBe("arábica especial");
    expect(ctx.regiao).toBe("zona_mata");
    expect(ctx.altaPrioridade).toBe(true);
    expect(ctx.nomeCorretora).toBe("Café Top Corretora");
    expect(ctx.saudacao).toBe("Bom dia");
    expect(ctx.leadId).toBe(7);
  });

  test("graceful com campos faltando", () => {
    const ctx = buildContext({});
    expect(ctx.saudacao).toMatch(/^(Bom dia|Boa tarde|Boa noite)$/);
    expect(ctx.primeiroNome).toBeUndefined();
    expect(ctx.cidadeProdutor).toBeUndefined();
  });
});

describe("humanMessageBuilder · humanize", () => {
  test("retorna texto humano para intent valido", () => {
    const ctx = buildContext({
      lead: {
        id: 1,
        nome: "Rick Januário",
        cidade: "Manhuaçu",
        volume_range: "200_500",
      },
      corretora: { id: 1, name: "Café Top" },
    });
    const text = humanize("corretora_primeiro_contato_produtor", ctx);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    // Nao pode ter "{{" placeholder vazado
    expect(text).not.toMatch(/\{\{/);
    // Nao pode ter "Cidade: " (formato robotico antigo)
    expect(text).not.toMatch(/Cidade:\s/);
    // Nao pode ter "Volume informado:" (formato robotico)
    expect(text).not.toMatch(/Volume informado/);
  });

  test("nunca retorna texto com pontuacao duplicada", () => {
    for (const intent of Object.keys(VARIATIONS)) {
      const ctx = buildContext({
        lead: { id: 1, nome: "Rick", cidade: "Manhuaçu" },
        corretora: { id: 1, name: "Test" },
      });
      const text = humanize(intent, ctx);
      if (!text) continue;
      expect(text).not.toMatch(/\.\./);
      expect(text).not.toMatch(/\s,/);
      expect(text).not.toMatch(/\s\./);
    }
  });

  test("intent desconhecido retorna null", () => {
    expect(humanize("nao_existe", {})).toBeNull();
  });

  test("escolha deterministica por leadId", () => {
    const ctx1 = buildContext({
      lead: { id: 42, nome: "Rick" },
      corretora: { id: 1, name: "X" },
    });
    const a = humanize("corretora_primeiro_contato_produtor", ctx1);
    const b = humanize("corretora_primeiro_contato_produtor", ctx1);
    expect(a).toBe(b);
  });

  test("seeds diferentes produzem variantes diferentes (estatistico)", () => {
    const variations = new Set();
    for (let id = 1; id <= 20; id++) {
      const ctx = buildContext({
        lead: { id, nome: "Rick", cidade: "Manhuaçu", volume_range: "50_200" },
        corretora: { id: 1, name: "X" },
      });
      const text = humanize("corretora_primeiro_contato_produtor", ctx);
      if (text) variations.add(text);
    }
    // Em 20 leads diferentes deve gerar pelo menos 2 variantes distintas.
    expect(variations.size).toBeGreaterThanOrEqual(2);
  });

  test("omite frases quando dados faltam (sem placeholder vazio)", () => {
    const ctx = buildContext({
      lead: { id: 1, nome: "Rick" }, // sem cidade, sem volume
      corretora: { id: 1, name: "X" },
    });
    const text = humanize("corretora_primeiro_contato_produtor", ctx);
    expect(text).not.toMatch(/aí de\s*\./); // "aí de ." (cidade vazia)
    expect(text).not.toMatch(/\bem\s+\./); // "em ." (cidade vazia)
    expect(text).not.toMatch(/\b\d+\s+a\s+\.\b/); // volume vazio
  });
});

describe("humanMessageBuilder · humanizeForLead", () => {
  test("atalho equivale a buildContext + humanize", () => {
    const lead = { id: 5, nome: "Rick", cidade: "Manhuaçu" };
    const corretora = { id: 1, name: "X" };
    const a = humanizeForLead("corretora_primeiro_contato_produtor", {
      lead,
      corretora,
    });
    const ctx = buildContext({ lead, corretora });
    const b = humanize("corretora_primeiro_contato_produtor", ctx);
    expect(a).toBe(b);
  });
});

describe("humanMessageBuilder · qualidade do copy", () => {
  test("nenhum intent gera texto vazio para input minimo", () => {
    for (const intent of Object.keys(VARIATIONS)) {
      const ctx = buildContext({
        lead: { id: 1, nome: "Rick" },
        corretora: { id: 1, name: "Corretora" },
      });
      const text = humanize(intent, ctx);
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(20);
    }
  });

  test("nao repete cidade/volume em uma mesma mensagem", () => {
    const ctx = buildContext({
      lead: {
        id: 1,
        nome: "Rick",
        cidade: "Manhuaçu",
        volume_range: "200_500",
        tipo_cafe: "arabica",
      },
      corretora: { id: 1, name: "Test" },
    });
    for (const intent of Object.keys(VARIATIONS)) {
      const text = humanize(intent, ctx);
      if (!text) continue;
      const cidadeMatches = (text.match(/Manhuaçu/g) || []).length;
      expect(cidadeMatches).toBeLessThanOrEqual(1);
      // "200 a 500 sacas" nao pode aparecer 2x na mesma msg
      const volumeMatches = (text.match(/200 a 500 sacas/g) || []).length;
      expect(volumeMatches).toBeLessThanOrEqual(1);
    }
  });
});
