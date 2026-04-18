/**
 * test/unit/services/adminAuditService.unit.test.js
 *
 * Fase 7 — testa o helper diffFields (função pura, sem I/O).
 */

const {
  diffFields,
  truncateForAudit,
  AUDIT_TRUNCATE_MAX,
} = require("../../../services/adminAuditService");

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

describe("services/adminAuditService.truncateForAudit", () => {
  it("AUDIT_TRUNCATE_MAX é 500", () => {
    expect(AUDIT_TRUNCATE_MAX).toBe(500);
  });

  it("deixa strings curtas intocadas", () => {
    expect(truncateForAudit("hello")).toBe("hello");
    expect(truncateForAudit("")).toBe("");
  });

  it("trunca string > 500 chars com sufixo explicativo", () => {
    const long = "a".repeat(600);
    const r = truncateForAudit(long);
    expect(r).toMatch(/^a{500}… \(truncado 100 caracteres\)$/);
  });

  it("deixa null/undefined intactos", () => {
    expect(truncateForAudit(null)).toBeNull();
    expect(truncateForAudit(undefined)).toBeUndefined();
  });

  it("trunca objeto JSON grande devolvendo string marcada", () => {
    const big = { items: Array.from({ length: 100 }, (_, i) => `x${i}`) };
    const r = truncateForAudit(big);
    expect(typeof r).toBe("string");
    expect(r.length).toBeLessThanOrEqual(AUDIT_TRUNCATE_MAX + 30);
    expect(r).toMatch(/… \(truncado\)$/);
  });

  it("deixa objetos pequenos intactos", () => {
    const small = { name: "X", city: "Manhuaçu" };
    const r = truncateForAudit(small);
    expect(r).toEqual(small);
  });

  it("aplica truncate dentro de diffFields", () => {
    const before = { description: "x".repeat(600) };
    const after = { description: "y".repeat(600) };
    const diff = diffFields(before, after, ["description"]);
    expect(diff.before.description.length).toBeLessThan(600);
    expect(diff.after.description.length).toBeLessThan(600);
  });
});
