/**
 * test/unit/repositories/cartRepository.unit.test.js
 *
 * Estratégia:
 *  - Funções standalone (getCartWithItems, convertCart) → mock de pool
 *  - Funções transacionais (findOpenCart, createCart, etc.) → mock de conn
 *    passado diretamente como argumento
 *
 * O que está sendo testado:
 *   - getCartWithItems: dois queries, retorno correto quando cart é null
 *   - findOpenCart: retorna row ou null (nullish coalescing)
 *   - createCart: retorna insertId
 *   - lockProduct / lockCartItem: retornam row ou null, SQL contém FOR UPDATE
 *   - updateCartItemById/ByProduct: params na ordem correta
 *   - insertCartItem: 4 params na ordem correta
 *   - deleteCartItem / deleteAllCartItems: passes corretos
 *   - closeCart: status = "fechado"
 *   - convertCart: usa pool diretamente
 */

"use strict";

jest.mock("../../../config/pool");

const pool = require("../../../config/pool");
const repo = require("../../../repositories/cartRepository");

function makeMockConn() {
  return { query: jest.fn() };
}

function mockPoolQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Standalone — usa pool diretamente
// ---------------------------------------------------------------------------

describe("cartRepository — getCartWithItems", () => {
  test("retorna cart e items quando carrinho aberto existe", async () => {
    const cart = { id: 10, usuario_id: 1, status: "aberto" };
    const items = [{ item_id: 1, produto_id: 5, quantidade: 2 }];

    mockPoolQuery([[cart]]);  // primeiro query: busca o carrinho
    mockPoolQuery([items]);   // segundo query: busca os itens

    const result = await repo.getCartWithItems(1);

    expect(result.cart).toEqual(cart);
    expect(result.items).toEqual(items);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test("retorna { cart: null, items: [] } quando não há carrinho aberto", async () => {
    mockPoolQuery([[undefined]]);  // [[undefined]] → cart = undefined

    const result = await repo.getCartWithItems(1);

    expect(result.cart).toBeNull();
    expect(result.items).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(1); // não faz segundo query
  });
});

describe("cartRepository — convertCart", () => {
  test("usa pool diretamente e filtra por usuario_id e status aberto", async () => {
    mockPoolQuery([{ affectedRows: 1 }]);

    await repo.convertCart(5);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("convertido");
    expect(sql).toContain("aberto");
    expect(params).toEqual([5]);
  });
});

// ---------------------------------------------------------------------------
// Transacionais — recebem conn como primeiro argumento
// ---------------------------------------------------------------------------

describe("cartRepository — findOpenCart", () => {
  test("retorna row quando carrinho aberto existe", async () => {
    const conn = makeMockConn();
    const row = { id: 7, usuario_id: 3, status: "aberto" };
    conn.query.mockResolvedValueOnce([[row]]);

    const result = await repo.findOpenCart(conn, 3);

    expect(result).toEqual(row);
    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([3]);
  });

  test("retorna null quando não há carrinho aberto (nullish coalescing)", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[undefined]]);

    const result = await repo.findOpenCart(conn, 3);
    expect(result).toBeNull();
  });
});

describe("cartRepository — createCart", () => {
  test("retorna insertId do novo carrinho", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const result = await repo.createCart(conn, 8);

    expect(result).toBe(42);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into carrinhos");
    expect(params).toEqual([8]);
  });
});

describe("cartRepository — lockProduct", () => {
  test("retorna produto com FOR UPDATE no SQL", async () => {
    const conn = makeMockConn();
    const row = { id: 5, price: 150.0, quantity: 10 };
    conn.query.mockResolvedValueOnce([[row]]);

    const result = await repo.lockProduct(conn, 5);

    expect(result).toEqual(row);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain("FOR UPDATE");
    expect(params).toEqual([5]);
  });

  test("retorna null quando produto não encontrado", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[undefined]]);

    const result = await repo.lockProduct(conn, 999);
    expect(result).toBeNull();
  });
});

describe("cartRepository — lockCartItem", () => {
  test("retorna item com FOR UPDATE, params: carrinhoId e productId", async () => {
    const conn = makeMockConn();
    const row = { id: 3, quantidade: 2 };
    conn.query.mockResolvedValueOnce([[row]]);

    const result = await repo.lockCartItem(conn, 10, 5);

    expect(result).toEqual(row);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain("FOR UPDATE");
    expect(params).toEqual([10, 5]);
  });

  test("retorna null quando item não existe no carrinho", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[undefined]]);

    const result = await repo.lockCartItem(conn, 1, 99);
    expect(result).toBeNull();
  });
});

describe("cartRepository — updateCartItemById", () => {
  test("passa quantidade antes do itemId", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateCartItemById(conn, 7, 5); // itemId=7, quantidade=5

    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([5, 7]); // quantidade, id
  });
});

describe("cartRepository — updateCartItemByProduct", () => {
  test("passa quantidade, carrinhoId, productId nessa ordem", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateCartItemByProduct(conn, 10, 5, 3); // carrinhoId=10, productId=5, quantidade=3

    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([3, 10, 5]); // quantidade, carrinhoId, productId
  });
});

describe("cartRepository — insertCartItem", () => {
  test("passa carrinhoId, productId, quantidade, price nessa ordem", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ insertId: 20 }]);

    await repo.insertCartItem(conn, 10, 5, 2, 99.90);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into carrinho_itens");
    expect(params).toEqual([10, 5, 2, 99.90]);
  });
});

describe("cartRepository — deleteCartItem", () => {
  test("passa carrinhoId e productId", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.deleteCartItem(conn, 10, 5);

    const [, params] = conn.query.mock.calls[0];
    expect(params).toEqual([10, 5]);
  });
});

describe("cartRepository — deleteAllCartItems", () => {
  test("deleta todos os itens pelo carrinhoId", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

    await repo.deleteAllCartItems(conn, 10);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("delete from carrinho_itens");
    expect(params).toEqual([10]);
  });
});

describe("cartRepository — closeCart", () => {
  test("atualiza status para fechado", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.closeCart(conn, 10);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("fechado");
    expect(params).toEqual([10]);
  });
});
