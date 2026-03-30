/**
 * test/unit/schemas/cartSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - CartItemBodySchema: produto_id e quantidade (POST e PATCH /api/cart/items)
 *     - valores válidos → success com dados coercidos para number
 *     - produto_id: 0, negativo, NaN, ausente → falha com mensagem uniforme
 *     - quantidade: 0, negativo, acima de 10000, NaN, ausente → falha com mensagem uniforme
 *   - CartItemParamSchema: :produtoId como string de URL (DELETE /api/cart/items/:produtoId)
 *     - string de inteiro positivo → transform para Number
 *     - "0", "-1", "abc", ausente → falha com "produtoId inválido."
 *   - QTY_MIN e QTY_MAX exportados corretamente
 */

"use strict";

const {
  CartItemBodySchema,
  CartItemParamSchema,
  QTY_MIN,
  QTY_MAX,
} = require("../../../schemas/cartSchemas");

// ---------------------------------------------------------------------------
// Constantes exportadas
// ---------------------------------------------------------------------------

describe("Constantes exportadas", () => {
  test("QTY_MIN é 1", () => expect(QTY_MIN).toBe(1));
  test("QTY_MAX é 10000", () => expect(QTY_MAX).toBe(10000));
});

// ---------------------------------------------------------------------------
// CartItemBodySchema — produto_id
// ---------------------------------------------------------------------------

describe("CartItemBodySchema — produto_id", () => {
  const VALID = { produto_id: 1, quantidade: 1 };

  test("inteiro positivo → success, valor como number", () => {
    const r = CartItemBodySchema.safeParse({ produto_id: 105, quantidade: 1 });
    expect(r.success).toBe(true);
    expect(r.data.produto_id).toBe(105);
  });

  test("string numérica '5' é coercida → success", () => {
    const r = CartItemBodySchema.safeParse({ produto_id: "5", quantidade: 1 });
    expect(r.success).toBe(true);
    expect(r.data.produto_id).toBe(5);
  });

  test("produto_id 0 → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, produto_id: 0 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produto_id é obrigatório e deve ser válido.");
  });

  test("produto_id negativo → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, produto_id: -1 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produto_id é obrigatório e deve ser válido.");
  });

  test("produto_id não-numérico ('abc') → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, produto_id: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produto_id é obrigatório e deve ser válido.");
  });

  test("produto_id ausente → falha", () => {
    const r = CartItemBodySchema.safeParse({ quantidade: 1 });
    expect(r.success).toBe(false);
  });

  test("produto_id decimal (1.5) → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, produto_id: 1.5 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produto_id é obrigatório e deve ser válido.");
  });
});

// ---------------------------------------------------------------------------
// CartItemBodySchema — quantidade
// ---------------------------------------------------------------------------

describe("CartItemBodySchema — quantidade", () => {
  const VALID = { produto_id: 1, quantidade: 1 };
  const QTY_MSG = `quantidade deve ser um inteiro entre ${QTY_MIN} e ${QTY_MAX}.`;

  test("1 (mínimo) → success", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: 1 });
    expect(r.success).toBe(true);
    expect(r.data.quantidade).toBe(1);
  });

  test("10000 (máximo) → success", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: 10000 });
    expect(r.success).toBe(true);
    expect(r.data.quantidade).toBe(10000);
  });

  test("string numérica '3' é coercida → success", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: "3" });
    expect(r.success).toBe(true);
    expect(r.data.quantidade).toBe(3);
  });

  test("0 → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: 0 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(QTY_MSG);
  });

  test("negativo (-1) → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: -1 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(QTY_MSG);
  });

  test("acima do máximo (10001) → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: 10001 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(QTY_MSG);
  });

  test("NaN ('abc') → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(QTY_MSG);
  });

  test("decimal (1.5) → falha", () => {
    const r = CartItemBodySchema.safeParse({ ...VALID, quantidade: 1.5 });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(QTY_MSG);
  });

  test("ausente → falha", () => {
    const r = CartItemBodySchema.safeParse({ produto_id: 1 });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CartItemParamSchema
// ---------------------------------------------------------------------------

describe("CartItemParamSchema", () => {
  test("'105' → success, transforma em number 105", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "105" });
    expect(r.success).toBe(true);
    expect(r.data.produtoId).toBe(105);
  });

  test("'1' (mínimo) → success", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "1" });
    expect(r.success).toBe(true);
    expect(r.data.produtoId).toBe(1);
  });

  test("'0' → falha", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "0" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produtoId inválido.");
  });

  test("'-1' → falha", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "-1" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produtoId inválido.");
  });

  test("'abc' → falha", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produtoId inválido.");
  });

  test("'1.5' → falha (regex exige inteiro)", () => {
    const r = CartItemParamSchema.safeParse({ produtoId: "1.5" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("produtoId inválido.");
  });

  test("ausente → falha", () => {
    const r = CartItemParamSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
