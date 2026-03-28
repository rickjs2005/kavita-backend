/**
 * test/unit/schemas/requests.unit.test.js
 *
 * O que está sendo testado:
 *   - formatZodErrors: função pura — converte zodError.issues em [{field, message}]
 *   - CriarProdutoSchema: campos obrigatórios, limites de tamanho
 *   - AtualizarProdutoSchema: inclui keepImages ausente em CriarProduto
 *   - ProdutoIdParamSchema: transform string → número, rejeita ids inválidos
 */

"use strict";

const { z } = require("zod");
const {
  CriarProdutoSchema,
  AtualizarProdutoSchema,
  ProdutoIdParamSchema,
  formatZodErrors,
} = require("../../../schemas/requests");

// ---------------------------------------------------------------------------
// formatZodErrors — função pura de formatação
// ---------------------------------------------------------------------------

describe("formatZodErrors", () => {
  test("converte issue simples em { field, message }", () => {
    const schema = z.object({ nome: z.string().min(1, "Nome obrigatório.") });
    const result = schema.safeParse({ nome: "" });
    expect(result.success).toBe(false);

    const errors = formatZodErrors(result.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ field: "nome", message: "Nome obrigatório." });
  });

  test("issue sem path (body-level) usa 'body' como campo", () => {
    // Simula um refine no nível do objeto
    const schema = z.object({}).refine(() => false, "Erro global.");
    const result = schema.safeParse({});
    expect(result.success).toBe(false);

    const errors = formatZodErrors(result.error);
    expect(errors[0].field).toBe("body");
    expect(errors[0].message).toBe("Erro global.");
  });

  test("converte múltiplos issues em múltiplos erros", () => {
    const schema = z.object({
      a: z.string().min(1, "A obrigatório."),
      b: z.number({ required_error: "B obrigatório." }),
    });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);

    const errors = formatZodErrors(result.error);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("a");
    expect(fields).toContain("b");
  });

  test("campos aninhados usam notação ponto", () => {
    const schema = z.object({ endereco: z.object({ cep: z.string().min(1, "CEP obrigatório.") }) });
    const result = schema.safeParse({ endereco: { cep: "" } });
    expect(result.success).toBe(false);

    const errors = formatZodErrors(result.error);
    expect(errors[0].field).toBe("endereco.cep");
  });
});

// ---------------------------------------------------------------------------
// CriarProdutoSchema
// ---------------------------------------------------------------------------

describe("CriarProdutoSchema — campos obrigatórios", () => {
  test("objeto vazio é inválido", () => {
    const r = CriarProdutoSchema.safeParse({});
    expect(r.success).toBe(false);
    const fields = r.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain("name");
    expect(fields).toContain("price");
    expect(fields).toContain("category_id");
  });

  test("produto mínimo válido: name, price, category_id", () => {
    const r = CriarProdutoSchema.safeParse({
      name: "Pulverizador XP",
      price: "1.299,90",
      category_id: "3",
    });
    expect(r.success).toBe(true);
  });
});

describe("CriarProdutoSchema — defaults de campos opcionais", () => {
  test("description default vazio", () => {
    const r = CriarProdutoSchema.safeParse({ name: "X", price: "10,00", category_id: "1" });
    expect(r.success).toBe(true);
    expect(r.data.description).toBe("");
  });

  test("quantity default '0'", () => {
    const r = CriarProdutoSchema.safeParse({ name: "X", price: "10,00", category_id: "1" });
    expect(r.success).toBe(true);
    expect(r.data.quantity).toBe("0");
  });

  test("shippingFree default '0'", () => {
    const r = CriarProdutoSchema.safeParse({ name: "X", price: "10,00", category_id: "1" });
    expect(r.success).toBe(true);
    expect(r.data.shippingFree).toBe("0");
  });
});

describe("CriarProdutoSchema — limites de tamanho", () => {
  test("name com 255 chars é válido (máximo)", () => {
    const r = CriarProdutoSchema.safeParse({
      name: "A".repeat(255),
      price: "10,00",
      category_id: "1",
    });
    expect(r.success).toBe(true);
  });

  test("name com 256 chars é inválido", () => {
    const r = CriarProdutoSchema.safeParse({
      name: "A".repeat(256),
      price: "10,00",
      category_id: "1",
    });
    expect(r.success).toBe(false);
  });

  test("description com 2000 chars é válida (máximo)", () => {
    const r = CriarProdutoSchema.safeParse({
      name: "X",
      price: "10,00",
      category_id: "1",
      description: "D".repeat(2000),
    });
    expect(r.success).toBe(true);
  });

  test("description com 2001 chars é inválida", () => {
    const r = CriarProdutoSchema.safeParse({
      name: "X",
      price: "10,00",
      category_id: "1",
      description: "D".repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AtualizarProdutoSchema — inclui keepImages
// ---------------------------------------------------------------------------

describe("AtualizarProdutoSchema", () => {
  test("inclui keepImages com default '[]'", () => {
    const r = AtualizarProdutoSchema.safeParse({
      name: "X",
      price: "10,00",
      category_id: "1",
    });
    expect(r.success).toBe(true);
    expect(r.data.keepImages).toBe("[]");
  });

  test("keepImages informado é mantido", () => {
    const r = AtualizarProdutoSchema.safeParse({
      name: "X",
      price: "10,00",
      category_id: "1",
      keepImages: '["/uploads/products/img.webp"]',
    });
    expect(r.success).toBe(true);
    expect(r.data.keepImages).toBe('["/uploads/products/img.webp"]');
  });
});

// ---------------------------------------------------------------------------
// ProdutoIdParamSchema
// ---------------------------------------------------------------------------

describe("ProdutoIdParamSchema", () => {
  test("'7' → transforma em número 7", () => {
    const r = ProdutoIdParamSchema.safeParse({ id: "7" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(7);
  });

  test("'0' é inválido (deve ser positivo)", () => {
    const r = ProdutoIdParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
  });

  test("'-5' é inválido", () => {
    const r = ProdutoIdParamSchema.safeParse({ id: "-5" });
    expect(r.success).toBe(false);
  });

  test("'1abc' é inválido", () => {
    const r = ProdutoIdParamSchema.safeParse({ id: "1abc" });
    expect(r.success).toBe(false);
  });
});
