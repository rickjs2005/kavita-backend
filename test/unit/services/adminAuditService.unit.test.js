/**
 * test/unit/services/adminAuditService.unit.test.js
 *
 * Fase 7 — testa o helper diffFields (função pura, sem I/O).
 */

const { diffFields } = require("../../../services/adminAuditService");

describe("services/adminAuditService.diffFields", () => {
  it("retorna changed_fields vazio quando nada mudou", () => {
    const a = { name: "Café", city: "Manhuaçu", is_featured: true };
    const b = { name: "Café", city: "Manhuaçu", is_featured: true };
    const diff = diffFields(a, b, ["name", "city", "is_featured"]);
    expect(diff.changed_fields).toEqual([]);
    expect(diff.before).toEqual({});
    expect(diff.after).toEqual({});
  });

  it("captura apenas campos que efetivamente mudaram", () => {
    const before = { name: "Café do João", city: "Manhuaçu", description: "X" };
    const after = { name: "Café do João", city: "Reduto", description: "X" };
    const diff = diffFields(before, after, ["name", "city", "description"]);
    expect(diff.changed_fields).toEqual(["city"]);
    expect(diff.before).toEqual({ city: "Manhuaçu" });
    expect(diff.after).toEqual({ city: "Reduto" });
  });

  it("trata null/undefined como iguais quando ambos ausentes", () => {
    const a = { name: "X" };
    const b = { name: "X", extra: null };
    const diff = diffFields(a, b, ["name", "extra"]);
    expect(diff.changed_fields).toEqual([]);
  });

  it("compara arrays/objetos via JSON.stringify", () => {
    const a = { tipos: ["arabica_comum", "natural"] };
    const b = { tipos: ["arabica_comum", "natural"] };
    const diff = diffFields(a, b, ["tipos"]);
    expect(diff.changed_fields).toEqual([]);
  });

  it("detecta mudança em array com elemento diferente", () => {
    const a = { tipos: ["arabica_comum"] };
    const b = { tipos: ["arabica_especial"] };
    const diff = diffFields(a, b, ["tipos"]);
    expect(diff.changed_fields).toEqual(["tipos"]);
    expect(diff.before.tipos).toEqual(["arabica_comum"]);
    expect(diff.after.tipos).toEqual(["arabica_especial"]);
  });

  it("ignora campos não listados", () => {
    const a = { name: "A", hidden: "secret-old" };
    const b = { name: "A", hidden: "secret-new" };
    const diff = diffFields(a, b, ["name"]);
    expect(diff.changed_fields).toEqual([]);
    expect(diff.before).toEqual({});
  });

  it("funciona com before/after nulos sem quebrar", () => {
    const diff = diffFields(null, { name: "X" }, ["name"]);
    expect(diff.changed_fields).toEqual(["name"]);
    expect(diff.before.name).toBeNull();
    expect(diff.after.name).toBe("X");
  });
});
