/**
 * test/unit/schemas/checkoutSchemas.unit.test.js
 *
 * Testes do checkoutBodySchema:
 * - normalização de entrega_tipo
 * - aliases de endereco (rua/endereco/logradouro, ponto_referencia/referencia/complemento)
 * - sem_numero → "S/N"
 * - campos obrigatórios (ENTREGA + URBANA)
 * - campos obrigatórios (ENTREGA + RURAL)
 * - RETIRADA sem endereco é válido
 * - coerção de id/quantidade para inteiros
 */

"use strict";

const { checkoutBodySchema } = require("../../../schemas/checkoutSchemas");

const BASE_PRODUTOS = [{ id: 1, quantidade: 2 }];

function valid(overrides = {}) {
  return {
    formaPagamento: "PIX",
    produtos: BASE_PRODUTOS,
    entrega_tipo: "ENTREGA",
    endereco: {
      cep: "12345-678",
      cidade: "Cidade",
      estado: "SP",
      rua: "Rua A",
      bairro: "Centro",
      numero: "10",
    },
    ...overrides,
  };
}

function parse(body) {
  return checkoutBodySchema.safeParse(body);
}

describe("checkoutBodySchema", () => {
  // -----------------------------------------------------------------------
  // Casos válidos
  // -----------------------------------------------------------------------

  test("ENTREGA URBANA completa é válida", () => {
    const r = parse(valid());
    expect(r.success).toBe(true);
  });

  test("RETIRADA sem endereco é válida", () => {
    const r = parse({ formaPagamento: "DINHEIRO", produtos: BASE_PRODUTOS, entrega_tipo: "RETIRADA" });
    expect(r.success).toBe(true);
  });

  test("ENTREGA RURAL completa é válida", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "MG",
          tipo_localidade: "RURAL",
          comunidade: "Bairro Rural",
          observacoes_acesso: "Porteira azul",
        },
      })
    );
    expect(r.success).toBe(true);
  });

  test("RURAL com ponto_referencia em vez de observacoes_acesso é válida", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "MG",
          tipo_localidade: "RURAL",
          comunidade: "Bairro Rural",
          ponto_referencia: "Próximo ao rio",
        },
      })
    );
    expect(r.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Normalização de entrega_tipo
  // -----------------------------------------------------------------------

  test("entrega_tipo ausente → normaliza para ENTREGA", () => {
    const r = parse(valid({ entrega_tipo: undefined }));
    // Vai falhar na validação de endereco se campos obrigatórios presentes → sucesso
    expect(r.success).toBe(true);
    expect(r.data.entrega_tipo).toBe("ENTREGA");
  });

  test("entrega_tipo lowercase 'retirada' → normaliza para RETIRADA", () => {
    const r = parse({ formaPagamento: "PIX", produtos: BASE_PRODUTOS, entrega_tipo: "retirada" });
    expect(r.success).toBe(true);
    expect(r.data.entrega_tipo).toBe("RETIRADA");
  });

  // -----------------------------------------------------------------------
  // Aliases de endereco
  // -----------------------------------------------------------------------

  test("alias 'endereco' usado como logradouro é aceito", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "SP",
          endereco: "Av Brasil",  // alias para rua
          bairro: "Centro",
          numero: "100",
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.data.endereco.rua).toBe("Av Brasil");
  });

  test("alias 'logradouro' usado como rua é aceito", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "SP",
          logradouro: "Rua das Flores",
          bairro: "Jardim",
          numero: "5",
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.data.endereco.rua).toBe("Rua das Flores");
  });

  test("alias 'referencia' normalizado para ponto_referencia", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "SP",
          rua: "Rua A",
          bairro: "Centro",
          numero: "1",
          referencia: "Ao lado do mercado",
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.data.endereco.ponto_referencia).toBe("Ao lado do mercado");
  });

  // -----------------------------------------------------------------------
  // sem_numero → "S/N"
  // -----------------------------------------------------------------------

  test("sem_numero=true e numero ausente → numero='S/N'", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "SP",
          rua: "Rua X",
          bairro: "Vila",
          sem_numero: true,
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.data.endereco.numero).toBe("S/N");
  });

  // -----------------------------------------------------------------------
  // Erros obrigatórios — ENTREGA
  // -----------------------------------------------------------------------

  test("ENTREGA sem endereco → erro em endereco", () => {
    const r = parse({ formaPagamento: "PIX", produtos: BASE_PRODUTOS, entrega_tipo: "ENTREGA" });
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endereco");
  });

  test("ENTREGA sem cep → erro em endereco.cep", () => {
    const r = parse(
      valid({
        endereco: { cidade: "Cidade", estado: "SP", rua: "Rua", bairro: "B", numero: "1" },
      })
    );
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endereco.cep");
  });

  test("ENTREGA URBANA sem bairro → erro em endereco.bairro", () => {
    const r = parse(
      valid({
        endereco: { cep: "12345-000", cidade: "Cidade", estado: "SP", rua: "Rua", numero: "1" },
      })
    );
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endereco.bairro");
  });

  test("ENTREGA RURAL sem comunidade → erro em endereco.comunidade", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "MG",
          tipo_localidade: "RURAL",
          observacoes_acesso: "Porteira azul",
        },
      })
    );
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endereco.comunidade");
  });

  test("ENTREGA RURAL sem observacoes_acesso nem ponto_referencia → erro", () => {
    const r = parse(
      valid({
        endereco: {
          cep: "12345-000",
          cidade: "Cidade",
          estado: "MG",
          tipo_localidade: "RURAL",
          comunidade: "Vila Rural",
        },
      })
    );
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endereco.observacoes_acesso");
  });

  // -----------------------------------------------------------------------
  // Campos raiz obrigatórios
  // -----------------------------------------------------------------------

  test("formaPagamento ausente → erro", () => {
    const { formaPagamento: _, ...body } = valid();
    const r = parse(body);
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("formaPagamento");
  });

  test("produtos vazio → erro", () => {
    const r = parse(valid({ produtos: [] }));
    expect(r.success).toBe(false);
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("produtos");
  });

  test("produtos com id inválido → erro", () => {
    const r = parse(valid({ produtos: [{ id: -1, quantidade: 1 }] }));
    expect(r.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Coerção de id/quantidade
  // -----------------------------------------------------------------------

  test("id e quantidade como string são coercidos para inteiros", () => {
    const r = parse(valid({ produtos: [{ id: "3", quantidade: "5" }] }));
    expect(r.success).toBe(true);
    expect(r.data.produtos[0].id).toBe(3);
    expect(r.data.produtos[0].quantidade).toBe(5);
  });
});
