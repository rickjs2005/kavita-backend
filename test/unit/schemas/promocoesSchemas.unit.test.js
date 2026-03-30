/**
 * test/unit/schemas/promocoesSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - ProductIdParamSchema: :productId como string de URL
 *     - inteiro positivo → transform para Number
 *     - "0", negativo, decimal, não-numérico → falha com "ID de produto inválido."
 */

"use strict";

const { ProductIdParamSchema } = require("../../../schemas/promocoesSchemas");

describe("ProductIdParamSchema", () => {
  test("'1' → success, transforma em 1", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "1" });
    expect(r.success).toBe(true);
    expect(r.data.productId).toBe(1);
  });

  test("'99' → success, transforma em 99", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "99" });
    expect(r.success).toBe(true);
    expect(r.data.productId).toBe(99);
  });

  test("'0' → falha", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "0" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID de produto inválido.");
  });

  test("'-5' → falha", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "-5" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID de produto inválido.");
  });

  test("'abc' → falha", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID de produto inválido.");
  });

  test("'1.5' → falha (regex exige inteiro)", () => {
    const r = ProductIdParamSchema.safeParse({ productId: "1.5" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID de produto inválido.");
  });

  test("ausente → falha", () => {
    const r = ProductIdParamSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
