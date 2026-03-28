/**
 * test/unit/schemas/cartsSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - CartIdParamSchema: :id deve ser inteiro positivo como string → transform para Number
 *   - ScanBodySchema: horas opcional, range 1–720, deve ser inteiro
 *   - NotifyBodySchema: tipo enum "whatsapp" | "email"
 */

"use strict";

const {
  CartIdParamSchema,
  ScanBodySchema,
  NotifyBodySchema,
} = require("../../../schemas/cartsSchemas");

// ---------------------------------------------------------------------------
// CartIdParamSchema
// ---------------------------------------------------------------------------

describe("CartIdParamSchema", () => {
  test("string '5' → transforma em número 5", () => {
    const r = CartIdParamSchema.safeParse({ id: "5" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(5);
  });

  test("'1' é o menor id válido", () => {
    const r = CartIdParamSchema.safeParse({ id: "1" });
    expect(r.success).toBe(true);
  });

  test("'0' é inválido (id deve ser positivo)", () => {
    const r = CartIdParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
  });

  test("'-1' é inválido", () => {
    const r = CartIdParamSchema.safeParse({ id: "-1" });
    expect(r.success).toBe(false);
  });

  test("'abc' é inválido", () => {
    const r = CartIdParamSchema.safeParse({ id: "abc" });
    expect(r.success).toBe(false);
  });

  test("'1.5' é inválido (não é inteiro)", () => {
    const r = CartIdParamSchema.safeParse({ id: "1.5" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScanBodySchema
// ---------------------------------------------------------------------------

describe("ScanBodySchema", () => {
  test("objeto vazio é válido (horas é opcional)", () => {
    const r = ScanBodySchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data.horas).toBeUndefined();
  });

  test("horas: 1 é válido (mínimo)", () => {
    const r = ScanBodySchema.safeParse({ horas: 1 });
    expect(r.success).toBe(true);
  });

  test("horas: 720 é válido (máximo — 30 dias)", () => {
    const r = ScanBodySchema.safeParse({ horas: 720 });
    expect(r.success).toBe(true);
  });

  test("horas: 0 é inválido (abaixo do mínimo)", () => {
    const r = ScanBodySchema.safeParse({ horas: 0 });
    expect(r.success).toBe(false);
  });

  test("horas: 721 é inválido (acima do máximo)", () => {
    const r = ScanBodySchema.safeParse({ horas: 721 });
    expect(r.success).toBe(false);
  });

  test("horas: 1.5 é inválido (não é inteiro)", () => {
    const r = ScanBodySchema.safeParse({ horas: 1.5 });
    expect(r.success).toBe(false);
  });

  test("horas como string '24' é coercida para número (z.coerce)", () => {
    const r = ScanBodySchema.safeParse({ horas: "24" });
    expect(r.success).toBe(true);
    expect(r.data.horas).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// NotifyBodySchema
// ---------------------------------------------------------------------------

describe("NotifyBodySchema", () => {
  test("tipo 'whatsapp' é válido", () => {
    const r = NotifyBodySchema.safeParse({ tipo: "whatsapp" });
    expect(r.success).toBe(true);
  });

  test("tipo 'email' é válido", () => {
    const r = NotifyBodySchema.safeParse({ tipo: "email" });
    expect(r.success).toBe(true);
  });

  test("tipo 'sms' é inválido (fora do enum)", () => {
    const r = NotifyBodySchema.safeParse({ tipo: "sms" });
    expect(r.success).toBe(false);
  });

  test("tipo ausente é inválido", () => {
    const r = NotifyBodySchema.safeParse({});
    expect(r.success).toBe(false);
  });

  test("mensagem de erro descreve os valores aceitos", () => {
    const r = NotifyBodySchema.safeParse({ tipo: "push" });
    expect(r.success).toBe(false);
    const msg = r.error.issues[0].message;
    expect(msg).toContain("whatsapp");
    expect(msg).toContain("email");
  });
});
