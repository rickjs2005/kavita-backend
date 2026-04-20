// test/unit/services/contratoService.unit.test.js
//
// Testes unitários do contratoService (Fase 10.1).
//
// Cobertura: projeção pública segura + schema discriminado por tipo
// + hash SHA-256. Puppeteer e Handlebars ficam fora do escopo unit —
// o render de PDF e o pipeline DB ficam para teste de integração
// posterior (PR 2).
"use strict";

const {
  parseDataFieldsByTipo,
  disponivelDataFields,
  entregaFuturaDataFields,
} = require("../../../schemas/contratoSchemas");
const { _internals } = require("../../../services/contratoService");

describe("schemas/contratoSchemas", () => {
  describe("disponivelDataFields", () => {
    it("aceita payload completo e válido", () => {
      const result = disponivelDataFields.parse({
        safra: "2025/2026",
        bebida_laudo: "Dura",
        quantidade_sacas: "200",
        preco_saca: "1450.00",
        prazo_pagamento_dias: "15",
        nome_armazem_ou_fazenda: "Armazém Central",
        id_amostra: "AMO-123",
      });
      expect(result.quantidade_sacas).toBe(200);
      expect(result.preco_saca).toBe(1450);
      expect(result.prazo_pagamento_dias).toBe(15);
      expect(result.id_amostra).toBe("AMO-123");
    });

    it("rejeita preço zero ou negativo", () => {
      expect(() =>
        disponivelDataFields.parse({
          safra: "2025/2026",
          bebida_laudo: "Dura",
          quantidade_sacas: 100,
          preco_saca: 0,
          prazo_pagamento_dias: 10,
          nome_armazem_ou_fazenda: "Armazém X",
        }),
      ).toThrow();
    });

    it("rejeita prazo acima de 180 dias", () => {
      expect(() =>
        disponivelDataFields.parse({
          safra: "2025/2026",
          bebida_laudo: "Dura",
          quantidade_sacas: 100,
          preco_saca: 1000,
          prazo_pagamento_dias: 999,
          nome_armazem_ou_fazenda: "Armazém X",
        }),
      ).toThrow();
    });
  });

  describe("entregaFuturaDataFields", () => {
    it("aceita basis negativo (desconto sobre CEPEA)", () => {
      const result = entregaFuturaDataFields.parse({
        safra: "2025/2026",
        safra_futura: "2026/2027",
        bebida_laudo: "Arábica especial",
        quantidade_sacas: 500,
        diferencial_basis: -25.5,
        data_referencia_cepea: "2026-04-20",
        nome_armazem_ou_fazenda: "Fazenda Santa Rita",
      });
      expect(result.diferencial_basis).toBe(-25.5);
      expect(result.data_referencia_cepea).toBe("2026-04-20");
    });

    it("rejeita data de referência fora do formato AAAA-MM-DD", () => {
      expect(() =>
        entregaFuturaDataFields.parse({
          safra: "2025/2026",
          safra_futura: "2026/2027",
          bebida_laudo: "Dura",
          quantidade_sacas: 100,
          diferencial_basis: 0,
          data_referencia_cepea: "20/04/2026",
          nome_armazem_ou_fazenda: "Armazém X",
        }),
      ).toThrow();
    });
  });

  describe("parseDataFieldsByTipo", () => {
    it("roteia para o schema certo conforme tipo", () => {
      const disp = parseDataFieldsByTipo("disponivel", {
        safra: "2025/2026",
        bebida_laudo: "Dura",
        quantidade_sacas: 100,
        preco_saca: 1000,
        prazo_pagamento_dias: 10,
        nome_armazem_ou_fazenda: "Armazém X",
      });
      expect(disp.quantidade_sacas).toBe(100);

      const fut = parseDataFieldsByTipo("entrega_futura", {
        safra: "2025/2026",
        safra_futura: "2026/2027",
        bebida_laudo: "Dura",
        quantidade_sacas: 200,
        diferencial_basis: 10,
        data_referencia_cepea: "2026-04-20",
        nome_armazem_ou_fazenda: "Armazém X",
      });
      expect(fut.diferencial_basis).toBe(10);
    });

    it("lança para tipo desconhecido", () => {
      expect(() =>
        parseDataFieldsByTipo("spot_cash", { safra: "2025" }),
      ).toThrow();
    });
  });
});

describe("contratoService internals", () => {
  describe("_sha256Hex", () => {
    it("produz hash determinístico de 64 chars hex", () => {
      const hash = _internals._sha256Hex(Buffer.from("contrato-teste"));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // Mesmo input => mesmo hash (determinístico, auditável).
      const again = _internals._sha256Hex(Buffer.from("contrato-teste"));
      expect(again).toBe(hash);
    });

    it("diferencia inputs próximos", () => {
      const h1 = _internals._sha256Hex(Buffer.from("contrato-a"));
      const h2 = _internals._sha256Hex(Buffer.from("contrato-b"));
      expect(h1).not.toBe(h2);
    });
  });

  describe("_publicProjection", () => {
    it("omite telefone, email e preço fechado", () => {
      const publicPayload = _internals._publicProjection({
        tipo: "disponivel",
        status: "signed",
        hash_sha256: "a".repeat(64),
        signed_at: new Date("2026-04-20"),
        created_at: new Date("2026-04-19"),
        corretora_name: "Corretora X",
        corretora_slug: "corretora-x",
        data_fields: {
          safra: "2025/2026",
          quantidade_sacas: 200,
          preco_saca: 1450,
          prazo_pagamento_dias: 15,
          __partes_produtor_nome: "João Silva",
          // Campos sensíveis que PODERIAM estar no snapshot mas não
          // devem vazar — o service guarda só o nome do produtor
          // nos campos __partes_*, não telefone/email/preço.
        },
      });
      // Sanidade: expõe resumo seguro
      expect(publicPayload.corretora.name).toBe("Corretora X");
      expect(publicPayload.hash_sha256).toBe("a".repeat(64));
      expect(publicPayload.resumo.safra).toBe("2025/2026");
      expect(publicPayload.resumo.quantidade_sacas).toBe(200);
      expect(publicPayload.resumo.produtor_nome).toBe("João Silva");

      // Sanidade inversa: nada de preço, prazo ou dados de contato.
      expect(publicPayload).not.toHaveProperty("preco_saca");
      expect(JSON.stringify(publicPayload)).not.toContain("preco_saca");
      expect(JSON.stringify(publicPayload)).not.toContain("prazo_pagamento");
    });

    it("usa safra_futura quando for contrato a termo", () => {
      const publicPayload = _internals._publicProjection({
        tipo: "entrega_futura",
        status: "draft",
        hash_sha256: "b".repeat(64),
        signed_at: null,
        created_at: new Date(),
        corretora_name: "Y",
        corretora_slug: "y",
        data_fields: {
          safra_futura: "2026/2027",
          quantidade_sacas: 500,
          __partes_produtor_nome: "Maria Souza",
        },
      });
      expect(publicPayload.resumo.safra).toBe("2026/2027");
    });
  });
});
