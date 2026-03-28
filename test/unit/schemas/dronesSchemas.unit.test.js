/**
 * test/unit/schemas/dronesSchemas.unit.test.js
 *
 * Testes unitários dos schemas Zod de drones.
 *
 * Foco: coerções e regras de negócio que protejem onboarding.
 * Qualquer refatoração nos schemas que quebre essas garantias vai falhar aqui.
 *
 * Schemas cobertos:
 * - createModelBodySchema      (POST /admin/drones/models)
 * - mediaSelectionBodySchema   (PUT /admin/drones/models/:key/media-selection)
 * - createRepresentativeBodySchema (POST /admin/drones/representantes)
 * - updateRepresentativeBodySchema (PUT /admin/drones/representantes/:id)
 * - formatDronesErrors         (formatter de erros)
 */

"use strict";

const {
  createModelBodySchema,
  mediaSelectionBodySchema,
  createRepresentativeBodySchema,
  updateRepresentativeBodySchema,
  formatDronesErrors,
} = require("../../../schemas/dronesSchemas");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parse(schema, input) {
  return schema.safeParse(input);
}

// ---------------------------------------------------------------------------
// createModelBodySchema
// ---------------------------------------------------------------------------

describe("createModelBodySchema", () => {
  const valid = { key: "ag_500", label: "AG-500", sort_order: 1, is_active: 1 };

  test("payload válido é aceito", () => {
    const { success, data } = parse(createModelBodySchema, valid);
    expect(success).toBe(true);
    expect(data.key).toBe("ag_500");
  });

  test("key é coercida para lowercase", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, key: "AG500" });
    expect(success).toBe(true);
    expect(data.key).toBe("ag500");
  });

  test("key com caracteres inválidos (traço) → falha", () => {
    const { success } = parse(createModelBodySchema, { ...valid, key: "ag-500" });
    expect(success).toBe(false);
  });

  test("key com menos de 2 chars → falha", () => {
    const { success } = parse(createModelBodySchema, { ...valid, key: "a" });
    expect(success).toBe(false);
  });

  test("key com mais de 20 chars → falha", () => {
    const { success } = parse(createModelBodySchema, { ...valid, key: "a".repeat(21) });
    expect(success).toBe(false);
  });

  test("key ausente → falha", () => {
    const { success } = parse(createModelBodySchema, { label: "X", sort_order: 0, is_active: 1 });
    expect(success).toBe(false);
  });

  test("label ausente → falha", () => {
    const { success } = parse(createModelBodySchema, { ...valid, label: "" });
    expect(success).toBe(false);
  });

  test("sort_order coercido de string para número", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, sort_order: "10" });
    expect(success).toBe(true);
    expect(data.sort_order).toBe(10);
  });

  test("sort_order ausente → 0 (default)", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, sort_order: undefined });
    expect(success).toBe(true);
    expect(data.sort_order).toBe(0);
  });

  test("is_active '1' string → 1", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, is_active: "1" });
    expect(success).toBe(true);
    expect(data.is_active).toBe(1);
  });

  test("is_active '0' string → 0", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, is_active: "0" });
    expect(success).toBe(true);
    expect(data.is_active).toBe(0);
  });

  test("is_active ausente → 1 (default ativo)", () => {
    const { success, data } = parse(createModelBodySchema, { ...valid, is_active: undefined });
    expect(success).toBe(true);
    expect(data.is_active).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// mediaSelectionBodySchema
// ---------------------------------------------------------------------------

describe("mediaSelectionBodySchema", () => {
  test("target 'HERO' e media_id válidos são aceitos", () => {
    const { success, data } = parse(mediaSelectionBodySchema, { target: "HERO", media_id: 5 });
    expect(success).toBe(true);
    expect(data.target).toBe("HERO");
    expect(data.media_id).toBe(5);
  });

  test("target 'CARD' é aceito", () => {
    const { success } = parse(mediaSelectionBodySchema, { target: "CARD", media_id: 3 });
    expect(success).toBe(true);
  });

  test("target coercido para uppercase ('hero' → 'HERO')", () => {
    const { success, data } = parse(mediaSelectionBodySchema, { target: "hero", media_id: 1 });
    expect(success).toBe(true);
    expect(data.target).toBe("HERO");
  });

  test("target inválido ('BANNER') → falha", () => {
    const { success } = parse(mediaSelectionBodySchema, { target: "BANNER", media_id: 1 });
    expect(success).toBe(false);
  });

  test("media_id zero → falha (min 1)", () => {
    const { success } = parse(mediaSelectionBodySchema, { target: "HERO", media_id: 0 });
    expect(success).toBe(false);
  });

  test("media_id string numérica → coercida para int", () => {
    const { success, data } = parse(mediaSelectionBodySchema, { target: "CARD", media_id: "7" });
    expect(success).toBe(true);
    expect(data.media_id).toBe(7);
  });

  test("media_id ausente → falha", () => {
    const { success } = parse(mediaSelectionBodySchema, { target: "HERO" });
    expect(success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createRepresentativeBodySchema
// ---------------------------------------------------------------------------

describe("createRepresentativeBodySchema", () => {
  const valid = {
    name: "Distribuidora X",
    whatsapp: "31999998888",
    cnpj: "12.345.678/0001-90",
  };

  test("payload mínimo válido é aceito", () => {
    const { success } = parse(createRepresentativeBodySchema, valid);
    expect(success).toBe(true);
  });

  test("whatsapp com máscara é normalizado para dígitos", () => {
    const { success, data } = parse(createRepresentativeBodySchema, {
      ...valid,
      whatsapp: "(31) 99999-8888",
    });
    expect(success).toBe(true);
    expect(data.whatsapp).toBe("31999998888");
  });

  test("whatsapp com menos de 10 dígitos → falha", () => {
    const { success } = parse(createRepresentativeBodySchema, {
      ...valid,
      whatsapp: "319999",
    });
    expect(success).toBe(false);
  });

  test("name ausente → falha", () => {
    const { success } = parse(createRepresentativeBodySchema, { ...valid, name: "" });
    expect(success).toBe(false);
  });

  test("cnpj ausente → falha", () => {
    const { success } = parse(createRepresentativeBodySchema, { ...valid, cnpj: "" });
    expect(success).toBe(false);
  });

  test("campos de endereço opcionais podem ser null", () => {
    const { success, data } = parse(createRepresentativeBodySchema, {
      ...valid,
      address_street: null,
      address_city: null,
      address_uf: null,
    });
    expect(success).toBe(true);
    expect(data.address_street).toBeNull();
  });

  test("is_active ausente → 1 (default ativo)", () => {
    const { success, data } = parse(createRepresentativeBodySchema, valid);
    expect(success).toBe(true);
    expect(data.is_active).toBe(1);
  });

  test("sort_order ausente → 0", () => {
    const { success, data } = parse(createRepresentativeBodySchema, valid);
    expect(success).toBe(true);
    expect(data.sort_order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateRepresentativeBodySchema (patch parcial)
// ---------------------------------------------------------------------------

describe("updateRepresentativeBodySchema", () => {
  test("body vazio é válido (nada a alterar)", () => {
    const { success, data } = parse(updateRepresentativeBodySchema, {});
    expect(success).toBe(true);
    expect(Object.keys(data)).toHaveLength(0);
  });

  test("apenas name → outros campos ausentes não aparecem no resultado", () => {
    const { success, data } = parse(updateRepresentativeBodySchema, { name: "Novo Nome" });
    expect(success).toBe(true);
    expect(data.name).toBe("Novo Nome");
    expect(data.whatsapp).toBeUndefined();
  });

  test("whatsapp com máscara normalizado para dígitos", () => {
    const { success, data } = parse(updateRepresentativeBodySchema, {
      whatsapp: "(21) 98765-4321",
    });
    expect(success).toBe(true);
    expect(data.whatsapp).toBe("21987654321");
  });

  test("whatsapp inválido (poucos dígitos) → falha mesmo sendo opcional", () => {
    const { success } = parse(updateRepresentativeBodySchema, { whatsapp: "123" });
    expect(success).toBe(false);
  });

  test("name vazio → falha (min 1)", () => {
    const { success } = parse(updateRepresentativeBodySchema, { name: "" });
    expect(success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDronesErrors
// ---------------------------------------------------------------------------

describe("formatDronesErrors", () => {
  test("retorna [{ field, message }] para erro de campo", () => {
    const { error } = parse(createModelBodySchema, { key: "ab-cd", label: "", sort_order: 0, is_active: 1 });
    const formatted = formatDronesErrors(error);
    expect(Array.isArray(formatted)).toBe(true);
    formatted.forEach((e) => {
      expect(e).toHaveProperty("field");
      expect(e).toHaveProperty("message");
      expect(e).not.toHaveProperty("reason"); // campo 'reason' foi removido
    });
  });

  test("campo sem path usa 'body' como field", () => {
    // Força um erro sem path simulando issue com path vazio
    const fakeError = { issues: [{ path: [], message: "erro geral" }] };
    const formatted = formatDronesErrors(fakeError);
    expect(formatted[0].field).toBe("body");
  });

  test("campo aninhado usa dot-notation", () => {
    // address_uf com valor inválido (mais de 2 chars)
    const { error } = parse(createRepresentativeBodySchema, {
      name: "X",
      whatsapp: "31999998888",
      cnpj: "12.345.678/0001-90",
      address_uf: "RJ-MG", // > 2 chars
    });
    const formatted = formatDronesErrors(error);
    const ufError = formatted.find((e) => e.field === "address_uf");
    expect(ufError).toBeDefined();
  });
});
