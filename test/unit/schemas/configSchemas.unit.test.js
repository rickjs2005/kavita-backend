/**
 * test/unit/schemas/configSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - UpdateSettingsSchema: patch semântico (todos opcionais), .strict() bloqueia campos extra
 *   - UpdateSettingsSchema: validação de e-mail, mp_auto_return enum
 *   - CreateCategorySchema: nome obrigatório, ativo default true
 *   - UpdateCategorySchema: todos opcionais, nome não pode ser string vazia
 *   - CategoryIdParamSchema: transform para número
 */

"use strict";

const {
  UpdateSettingsSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CategoryIdParamSchema,
} = require("../../../schemas/configSchemas");

// ---------------------------------------------------------------------------
// UpdateSettingsSchema
// ---------------------------------------------------------------------------

describe("UpdateSettingsSchema — patch semântico", () => {
  test("objeto vazio é válido (todos os campos são opcionais)", () => {
    const r = UpdateSettingsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("subconjunto de campos é válido", () => {
    const r = UpdateSettingsSchema.safeParse({ store_name: "Kavita" });
    expect(r.success).toBe(true);
  });

  test("campo desconhecido é rejeitado (.strict())", () => {
    const r = UpdateSettingsSchema.safeParse({ campo_invalido: "x" });
    expect(r.success).toBe(false);
  });

  test("main_email inválido → erro de validação", () => {
    const r = UpdateSettingsSchema.safeParse({ main_email: "nao-e-email" });
    expect(r.success).toBe(false);
    const fields = r.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain("main_email");
  });

  test("main_email válido → aceito", () => {
    const r = UpdateSettingsSchema.safeParse({ main_email: "contato@kavita.com.br" });
    expect(r.success).toBe(true);
  });

  test("mp_auto_return: 'approved' é válido", () => {
    const r = UpdateSettingsSchema.safeParse({ mp_auto_return: "approved" });
    expect(r.success).toBe(true);
  });

  test("mp_auto_return: 'all' é válido", () => {
    const r = UpdateSettingsSchema.safeParse({ mp_auto_return: "all" });
    expect(r.success).toBe(true);
  });

  test("mp_auto_return: valor inválido é rejeitado", () => {
    const r = UpdateSettingsSchema.safeParse({ mp_auto_return: "none" });
    expect(r.success).toBe(false);
  });

  test("footer_links null é aceito (nullable)", () => {
    const r = UpdateSettingsSchema.safeParse({ footer_links: null });
    expect(r.success).toBe(true);
  });

  test("footer_links com link válido é aceito", () => {
    const r = UpdateSettingsSchema.safeParse({
      footer_links: [{ label: "Home", href: "/home" }],
    });
    expect(r.success).toBe(true);
  });

  test("footer_links com link sem label é rejeitado", () => {
    const r = UpdateSettingsSchema.safeParse({
      footer_links: [{ href: "/home" }],
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateCategorySchema
// ---------------------------------------------------------------------------

describe("CreateCategorySchema", () => {
  test("nome obrigatório: objeto sem nome é inválido", () => {
    const r = CreateCategorySchema.safeParse({});
    expect(r.success).toBe(false);
    const fields = r.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain("nome");
  });

  test("criação com nome válido é aceita", () => {
    const r = CreateCategorySchema.safeParse({ nome: "Drones" });
    expect(r.success).toBe(true);
  });

  test("ativo não informado → default true", () => {
    const r = CreateCategorySchema.safeParse({ nome: "Categoria" });
    expect(r.success).toBe(true);
    expect(r.data.ativo).toBe(true);
  });

  test("slug é opcional", () => {
    const r = CreateCategorySchema.safeParse({ nome: "Categoria", slug: "categoria" });
    expect(r.success).toBe(true);
  });

  test("nome com mais de 100 caracteres é rejeitado", () => {
    const r = CreateCategorySchema.safeParse({ nome: "A".repeat(101) });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateCategorySchema
// ---------------------------------------------------------------------------

describe("UpdateCategorySchema", () => {
  test("objeto vazio é válido (todos opcionais)", () => {
    const r = UpdateCategorySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("nome com string vazia é inválido (min 1)", () => {
    const r = UpdateCategorySchema.safeParse({ nome: "" });
    expect(r.success).toBe(false);
  });

  test("nome válido é aceito", () => {
    const r = UpdateCategorySchema.safeParse({ nome: "Novo Nome" });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CategoryIdParamSchema
// ---------------------------------------------------------------------------

describe("CategoryIdParamSchema", () => {
  test("'3' → transforma em número 3", () => {
    const r = CategoryIdParamSchema.safeParse({ id: "3" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(3);
  });

  test("'0' é inválido", () => {
    const r = CategoryIdParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
  });

  test("'abc' é inválido", () => {
    const r = CategoryIdParamSchema.safeParse({ id: "abc" });
    expect(r.success).toBe(false);
  });
});
