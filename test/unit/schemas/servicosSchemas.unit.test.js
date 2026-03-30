/**
 * test/unit/schemas/servicosSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - ServicosQuerySchema: normalização de query params (page, limit, sort, order, busca, especialidade)
 *     - parâmetros inválidos são normalizados (nunca rejeita GET /)
 *   - ServicoIdParamSchema: :id como string de URL
 *   - SolicitacaoBodySchema: campos obrigatórios e opcionais
 *   - AvaliacaoBodySchema: nota (1-5) e campos opcionais
 *   - TrabalheConoscoBodySchema: nome/whatsapp obrigatórios, especialidade_id opcional
 */

"use strict";

const {
  ServicosQuerySchema,
  ServicoIdParamSchema,
  SolicitacaoBodySchema,
  AvaliacaoBodySchema,
  TrabalheConoscoBodySchema,
} = require("../../../schemas/servicosSchemas");

// ---------------------------------------------------------------------------
// ServicosQuerySchema
// ---------------------------------------------------------------------------

describe("ServicosQuerySchema", () => {
  test("sem params → defaults (page=1, limit=12, sort=id, order=DESC)", () => {
    const r = ServicosQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ page: 1, limit: 12, sort: "id", order: "DESC", busca: "", especialidade: null });
  });

  test("params válidos → passados corretamente", () => {
    const r = ServicosQuerySchema.safeParse({ page: "2", limit: "6", sort: "nome", order: "asc", busca: " teste ", especialidade: "3" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ page: 2, limit: 6, sort: "nome", order: "ASC", busca: "teste", especialidade: 3 });
  });

  test("page inválido ('abc') → normaliza para 1", () => {
    const r = ServicosQuerySchema.safeParse({ page: "abc" });
    expect(r.success).toBe(true);
    expect(r.data.page).toBe(1);
  });

  test("page=0 → normaliza para 1", () => {
    const r = ServicosQuerySchema.safeParse({ page: "0" });
    expect(r.success).toBe(true);
    expect(r.data.page).toBe(1);
  });

  test("limit=200 → normaliza para 100 (máximo)", () => {
    const r = ServicosQuerySchema.safeParse({ limit: "200" });
    expect(r.success).toBe(true);
    expect(r.data.limit).toBe(100);
  });

  test("limit=0 → normaliza para 1 (mínimo)", () => {
    const r = ServicosQuerySchema.safeParse({ limit: "0" });
    expect(r.success).toBe(true);
    expect(r.data.limit).toBe(1);
  });

  test("sort inválido → normaliza para 'id'", () => {
    const r = ServicosQuerySchema.safeParse({ sort: "invalid_col; DROP TABLE" });
    expect(r.success).toBe(true);
    expect(r.data.sort).toBe("id");
  });

  test("sort='cargo' → aceito", () => {
    const r = ServicosQuerySchema.safeParse({ sort: "cargo" });
    expect(r.success).toBe(true);
    expect(r.data.sort).toBe("cargo");
  });

  test("order='DESC' case-insensitive → normaliza para 'DESC'", () => {
    const r = ServicosQuerySchema.safeParse({ order: "desc" });
    expect(r.success).toBe(true);
    expect(r.data.order).toBe("DESC");
  });

  test("order='ASC' → aceito", () => {
    const r = ServicosQuerySchema.safeParse({ order: "ASC" });
    expect(r.success).toBe(true);
    expect(r.data.order).toBe("ASC");
  });

  test("order inválido ('XYZ') → normaliza para 'DESC'", () => {
    const r = ServicosQuerySchema.safeParse({ order: "XYZ" });
    expect(r.success).toBe(true);
    expect(r.data.order).toBe("DESC");
  });

  test("especialidade negativa → null", () => {
    const r = ServicosQuerySchema.safeParse({ especialidade: "-1" });
    expect(r.success).toBe(true);
    expect(r.data.especialidade).toBeNull();
  });

  test("especialidade='abc' → null", () => {
    const r = ServicosQuerySchema.safeParse({ especialidade: "abc" });
    expect(r.success).toBe(true);
    expect(r.data.especialidade).toBeNull();
  });

  test("especialidade vazia ('') → null", () => {
    const r = ServicosQuerySchema.safeParse({ especialidade: "" });
    expect(r.success).toBe(true);
    expect(r.data.especialidade).toBeNull();
  });

  test("busca com espaço é trimada", () => {
    const r = ServicosQuerySchema.safeParse({ busca: "  eletricista  " });
    expect(r.success).toBe(true);
    expect(r.data.busca).toBe("eletricista");
  });
});

// ---------------------------------------------------------------------------
// ServicoIdParamSchema
// ---------------------------------------------------------------------------

describe("ServicoIdParamSchema", () => {
  test("'42' → success, transforma em 42", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "42" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(42);
  });

  test("'1' (mínimo) → success", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "1" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(1);
  });

  test("'0' → falha", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("'-5' → falha", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "-5" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("'abc' → falha", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("'1.5' → falha (regex exige inteiro)", () => {
    const r = ServicoIdParamSchema.safeParse({ id: "1.5" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("ausente → falha", () => {
    const r = ServicoIdParamSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SolicitacaoBodySchema
// ---------------------------------------------------------------------------

describe("SolicitacaoBodySchema", () => {
  const VALID = {
    colaborador_id: 1,
    nome_contato: "João Silva",
    whatsapp: "11999999999",
    descricao: "Preciso de serviço de pintura.",
  };

  test("corpo completo válido → success", () => {
    const r = SolicitacaoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.colaborador_id).toBe(1);
  });

  test("colaborador_id como string numérica → coercido para number", () => {
    const r = SolicitacaoBodySchema.safeParse({ ...VALID, colaborador_id: "5" });
    expect(r.success).toBe(true);
    expect(r.data.colaborador_id).toBe(5);
  });

  test("colaborador_id=0 → falha", () => {
    const r = SolicitacaoBodySchema.safeParse({ ...VALID, colaborador_id: 0 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toContain("colaborador_id");
  });

  test("colaborador_id ausente → falha", () => {
    const { colaborador_id, ...rest } = VALID;
    const r = SolicitacaoBodySchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  test("nome_contato vazio → falha", () => {
    const r = SolicitacaoBodySchema.safeParse({ ...VALID, nome_contato: "   " });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nome_contato é obrigatório.");
  });

  test("whatsapp ausente → falha", () => {
    const { whatsapp, ...rest } = VALID;
    const r = SolicitacaoBodySchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  test("descricao ausente → falha", () => {
    const { descricao, ...rest } = VALID;
    const r = SolicitacaoBodySchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  test("origem opcional presente → incluído", () => {
    const r = SolicitacaoBodySchema.safeParse({ ...VALID, origem: "site" });
    expect(r.success).toBe(true);
    expect(r.data.origem).toBe("site");
  });

  test("origem ausente → success (opcional)", () => {
    const r = SolicitacaoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.origem).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AvaliacaoBodySchema
// ---------------------------------------------------------------------------

describe("AvaliacaoBodySchema", () => {
  const VALID = { colaborador_id: 1, nota: 4 };

  test("corpo mínimo válido → success", () => {
    const r = AvaliacaoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.nota).toBe(4);
  });

  test("nota como string '5' → coercida para 5", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: "5" });
    expect(r.success).toBe(true);
    expect(r.data.nota).toBe(5);
  });

  test("nota=1 (mínimo) → success", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: 1 });
    expect(r.success).toBe(true);
  });

  test("nota=5 (máximo) → success", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: 5 });
    expect(r.success).toBe(true);
  });

  test("nota=0 → falha", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: 0 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nota deve ser um inteiro entre 1 e 5.");
  });

  test("nota=6 → falha", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: 6 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nota deve ser um inteiro entre 1 e 5.");
  });

  test("nota=3.5 (decimal) → falha", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: 3.5 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nota deve ser um inteiro entre 1 e 5.");
  });

  test("nota='abc' → falha", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, nota: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nota deve ser um inteiro entre 1 e 5.");
  });

  test("nota ausente → falha", () => {
    const r = AvaliacaoBodySchema.safeParse({ colaborador_id: 1 });
    expect(r.success).toBe(false);
  });

  test("comentario opcional presente → incluído", () => {
    const r = AvaliacaoBodySchema.safeParse({ ...VALID, comentario: "Ótimo serviço" });
    expect(r.success).toBe(true);
    expect(r.data.comentario).toBe("Ótimo serviço");
  });

  test("autor_nome opcional ausente → success", () => {
    const r = AvaliacaoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.autor_nome).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TrabalheConoscoBodySchema
// ---------------------------------------------------------------------------

describe("TrabalheConoscoBodySchema", () => {
  const VALID = { nome: "Maria Souza", whatsapp: "11988887777" };

  test("corpo mínimo válido → success", () => {
    const r = TrabalheConoscoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.nome).toBe("Maria Souza");
  });

  test("corpo completo → success", () => {
    const r = TrabalheConoscoBodySchema.safeParse({
      ...VALID,
      cargo: "Eletricista",
      descricao: "10 anos de experiência",
      especialidade_id: 2,
    });
    expect(r.success).toBe(true);
    expect(r.data.especialidade_id).toBe(2);
  });

  test("nome vazio → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, nome: "" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nome é obrigatório.");
  });

  test("nome só espaços → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, nome: "   " });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("nome é obrigatório.");
  });

  test("nome ausente → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ whatsapp: "11988887777" });
    expect(r.success).toBe(false);
  });

  test("whatsapp ausente → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ nome: "Teste" });
    expect(r.success).toBe(false);
  });

  test("especialidade_id como string numérica → aceito", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, especialidade_id: "3" });
    expect(r.success).toBe(true);
  });

  test("especialidade_id=0 → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, especialidade_id: 0 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("especialidade_id deve ser um inteiro positivo.");
  });

  test("especialidade_id negativo → falha", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, especialidade_id: -1 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("especialidade_id deve ser um inteiro positivo.");
  });

  test("especialidade_id ausente → success (opcional)", () => {
    const r = TrabalheConoscoBodySchema.safeParse(VALID);
    expect(r.success).toBe(true);
    expect(r.data.especialidade_id).toBeUndefined();
  });

  test("especialidade_id null → success (opcional)", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, especialidade_id: null });
    expect(r.success).toBe(true);
  });

  test("especialidade_id='' → success (tratado como ausente)", () => {
    const r = TrabalheConoscoBodySchema.safeParse({ ...VALID, especialidade_id: "" });
    expect(r.success).toBe(true);
  });
});
