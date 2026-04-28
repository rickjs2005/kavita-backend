/**
 * test/unit/repositories/checkoutRepository.unit.test.js
 *
 * Repositório mais complexo do projeto — orquestra checkout transacional:
 * pedido, estoque, cupom, frete, carrinho abandonado e perfil do usuário.
 *
 * Estratégia: mock de conn (objeto com .query()) para funções transacionais.
 *
 * O que está sendo testado:
 *   - createOrder: 9 parâmetros na ordem correta, retorna insertId
 *   - updateOrderShipping: 5 params incluindo pedidoId ao final
 *   - updateUserInfo: lógica condicional (apenas campos preenchidos vão no SET)
 *   - updateUserInfo: não executa query quando objeto vazio
 *   - lockProducts: passa array de ids, contém FOR UPDATE
 *   - debitStock: quantidade antes do productId
 *   - findCouponByCode / lockCoupon: retornam row ou null
 *   - incrementCouponUsage: passa couponId
 */

"use strict";

const repo = require("../../../repositories/checkoutRepository");

function makeMockConn() {
  return { query: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findOpenCartId
// ---------------------------------------------------------------------------

describe("checkoutRepository — findOpenCartId", () => {
  test("retorna row quando carrinho aberto existe", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[{ id: 5 }]]);

    const result = await repo.findOpenCartId(conn, 1);

    expect(result).toEqual({ id: 5 });
    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([1]);
  });

  test("retorna null quando não há carrinho aberto", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    const result = await repo.findOpenCartId(conn, 1);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

describe("checkoutRepository — createOrder", () => {
  test("insere pedido com 9 params na ordem correta e retorna insertId", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ insertId: 99 }]);

    const result = await repo.createOrder(conn, {
      userId: 10,
      enderecoStr: "Rua A, 1 - SP",
      formaPagamento: "PIX",
      cupomNorm: "DESC10",
    });

    expect(result).toBe(99);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into pedidos");
    // userId, endereco, formaPagamento, status(pendente), status_pagamento(pendente),
    // status_entrega(em_separacao), total(0), pagamento_id(null), cupom_codigo
    expect(params[0]).toBe(10);
    expect(params[1]).toBe("Rua A, 1 - SP");
    expect(params[2]).toBe("PIX");
    expect(params[3]).toBe("pendente");
    expect(params[4]).toBe("pendente");
    expect(params[5]).toBe("em_separacao");
    expect(params[6]).toBe(0);
    expect(params[7]).toBeNull();
    expect(params[8]).toBe("DESC10");
  });

  test("cupomNorm null → cupom_codigo = null", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await repo.createOrder(conn, {
      userId: 1,
      enderecoStr: "",
      formaPagamento: "PIX",
      cupomNorm: null,
    });

    const [, params] = conn.query.mock.calls[0];
    expect(params[8]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lockProducts
// ---------------------------------------------------------------------------

describe("checkoutRepository — lockProducts", () => {
  test("passa array de ids e usa FOR UPDATE", async () => {
    const conn = makeMockConn();
    const rows = [{ id: 1, price: 100, quantity: 5 }];
    conn.query.mockResolvedValueOnce([rows]);

    const result = await repo.lockProducts(conn, [1, 2, 3]);

    expect(result).toEqual(rows);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain("FOR UPDATE");
    expect(params).toEqual([[1, 2, 3]]);
  });
});

// ---------------------------------------------------------------------------
// insertOrderItem
// ---------------------------------------------------------------------------

describe("checkoutRepository — insertOrderItem", () => {
  test("passa pedidoId, productId, quantidade, valorUnitario nessa ordem", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.insertOrderItem(conn, 10, 5, 3, 49.90);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into pedidos_produtos");
    expect(params).toEqual([10, 5, 3, 49.90]);
  });
});

// ---------------------------------------------------------------------------
// debitStock
// ---------------------------------------------------------------------------

describe("checkoutRepository — debitStock", () => {
  test("quantidade é o primeiro param, productId é o segundo", async () => {
    const conn = makeMockConn();
    conn.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])                                       // UPDATE products SET quantity = quantity - ?
      .mockResolvedValueOnce([[{ id: 7, quantity: 999, is_active: 1, deactivated_by: null }]]); // syncActiveByStock SELECT FOR UPDATE → noop

    await repo.debitStock(conn, 7, 3); // productId=7, quantidade=3

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("quantity - ?");
    expect(params).toEqual([3, 7]); // quantidade, productId
  });
});

// ---------------------------------------------------------------------------
// findCouponByCode / lockCoupon
// ---------------------------------------------------------------------------

describe("checkoutRepository — findCouponByCode", () => {
  test("retorna cupom quando encontrado", async () => {
    const conn = makeMockConn();
    const row = { id: 1, codigo: "DESC10", tipo: "percentual", valor: 10 };
    conn.query.mockResolvedValueOnce([[row]]);

    const result = await repo.findCouponByCode(conn, "DESC10");

    expect(result).toEqual(row);
    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual(["DESC10"]);
  });

  test("retorna null quando cupom não existe", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    const result = await repo.findCouponByCode(conn, "NAOEXISTE");
    expect(result).toBeNull();
  });
});

describe("checkoutRepository — lockCoupon", () => {
  test("SQL contém FOR UPDATE", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[{ id: 2, codigo: "FRETE0" }]]);

    await repo.lockCoupon(conn, "FRETE0");

    const [sql] = conn.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain("FOR UPDATE");
  });

  test("retorna null quando cupom não encontrado", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    const result = await repo.lockCoupon(conn, "X");
    expect(result).toBeNull();
  });
});

describe("checkoutRepository — incrementCouponUsage", () => {
  test("passa couponId", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.incrementCouponUsage(conn, 3);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("usos + 1");
    expect(params).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// updateOrderTotal
// ---------------------------------------------------------------------------

describe("checkoutRepository — updateOrderTotal", () => {
  test("passa total e pedidoId nessa ordem", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateOrderTotal(conn, 10, 299.90);

    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([299.90, 10]);
  });
});

// ---------------------------------------------------------------------------
// updateOrderShipping
// ---------------------------------------------------------------------------

describe("checkoutRepository — updateOrderShipping", () => {
  test("persiste 4 campos de frete mais pedidoId ao final", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateOrderShipping(conn, 10, {
      shipping_price: "29.90",
      shipping_rule_applied: "ZONE_SP",
      shipping_prazo_dias: "5",
      shipping_cep: "01310100",
    });

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("shipping_price");
    expect(params[0]).toBe(29.90);           // Number(shipping_price)
    expect(params[1]).toBe("ZONE_SP");       // String(shipping_rule_applied)
    expect(params[2]).toBe(5);               // Number(shipping_prazo_dias)
    expect(params[3]).toBe("01310100");      // String(shipping_cep)
    expect(params[4]).toBe(10);              // pedidoId ao final
  });

  test("shipping_prazo_dias null → persiste null", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateOrderShipping(conn, 1, {
      shipping_price: 0,
      shipping_rule_applied: "FLAT",
      shipping_prazo_dias: null,
      shipping_cep: null,
    });

    const [, params] = conn.query.mock.calls[0];
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateUserInfo — lógica condicional crítica
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getActivePromotions
// ---------------------------------------------------------------------------

describe("checkoutRepository — getActivePromotions", () => {
  test("retorna rows com product_id e final_price", async () => {
    const conn = makeMockConn();
    const rows = [{ product_id: 1, final_price: "89.90" }];
    conn.query.mockResolvedValueOnce([rows]);

    const result = await repo.getActivePromotions(conn, [1, 2]);

    expect(result).toEqual(rows);
  });

  test("SQL contém calcFinalPrice com alias 'pp'", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    await repo.getActivePromotions(conn, [1]);

    const [sql] = conn.query.mock.calls[0];
    // fórmula central — garante que o alias correto está no SQL emitido
    expect(sql).toContain("pp.promo_price");
    expect(sql).toContain("pp.discount_percent");
    expect(sql).toContain("DECIMAL(10,2)");
  });

  test("SQL contém filtro de promoção ativa com alias 'pp'", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    await repo.getActivePromotions(conn, [1]);

    const [sql] = conn.query.mock.calls[0];
    expect(sql).toContain("pp.is_active = 1");
    expect(sql).toContain("pp.start_at");
    expect(sql).toContain("pp.end_at");
  });

  test("passa ids como único parâmetro bind", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);

    await repo.getActivePromotions(conn, [3, 7]);

    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([[3, 7]]);
  });
});

// ---------------------------------------------------------------------------
// updateUserInfo — lógica condicional crítica
// ---------------------------------------------------------------------------

describe("checkoutRepository — updateUserInfo", () => {
  test("atualiza nome, telefone e cpf quando todos preenchidos", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateUserInfo(conn, 5, {
      nome: "João Silva",
      telefone: "(11) 99999-9999",
      cpf: "123.456.789-00",
    });

    expect(conn.query).toHaveBeenCalledTimes(1);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("nome = ?");
    expect(sql).toContain("telefone = ?");
    expect(sql).toContain("cpf = ?");
    // userId sempre ao final
    expect(params[params.length - 1]).toBe(5);
  });

  test("não executa query quando todos os campos estão vazios", async () => {
    const conn = makeMockConn();

    await repo.updateUserInfo(conn, 5, { nome: "", telefone: "", cpf: "" });

    expect(conn.query).not.toHaveBeenCalled();
  });

  test("não executa query quando objeto vazio", async () => {
    const conn = makeMockConn();

    await repo.updateUserInfo(conn, 5, {});

    expect(conn.query).not.toHaveBeenCalled();
  });

  test("telefone: apenas dígitos são persistidos", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateUserInfo(conn, 1, { telefone: "(11) 99999-8888" });

    const [, params] = conn.query.mock.calls[0];
    expect(params[0]).toBe("11999998888");
  });
});
