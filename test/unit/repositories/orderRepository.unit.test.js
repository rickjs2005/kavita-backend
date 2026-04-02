"use strict";

const poolPath = require.resolve("../../../config/pool");
const cpfCryptoPath = require.resolve("../../../utils/cpfCrypto");

describe("orderRepository", () => {
  let repo, pool;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
    }));

    // CPF crypto: identity in test (no encryption key)
    jest.doMock(cpfCryptoPath, () => ({
      decryptCPF: jest.fn((v) => v === "encrypted:cpf" ? "12345678901" : v),
    }));

    repo = require("../../../repositories/orderRepository");
    pool = require(poolPath);
  });

  // -----------------------------------------------------------------------
  // findAllOrderRows
  // -----------------------------------------------------------------------

  test("findAllOrderRows retorna rows com CPF decriptado", async () => {
    pool.query.mockResolvedValue([[
      { pedido_id: 1, usuario_cpf: "encrypted:cpf", usuario_nome: "Ana" },
      { pedido_id: 2, usuario_cpf: null, usuario_nome: "Bob" },
    ]]);

    const rows = await repo.findAllOrderRows();

    expect(rows).toHaveLength(2);
    expect(rows[0].usuario_cpf).toBe("12345678901");
    expect(rows[1].usuario_cpf).toBeNull();
  });

  test("findAllOrderRows retorna [] se não há pedidos", async () => {
    pool.query.mockResolvedValue([[]]);

    const rows = await repo.findAllOrderRows();

    expect(rows).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // findAllOrderItems
  // -----------------------------------------------------------------------

  test("findAllOrderItems retorna itens crus", async () => {
    pool.query.mockResolvedValue([[{ pedido_id: 1, produto_nome: "X", quantidade: 2 }]]);

    const items = await repo.findAllOrderItems();

    expect(items).toHaveLength(1);
    expect(items[0].produto_nome).toBe("X");
  });

  // -----------------------------------------------------------------------
  // findOrderRowById
  // -----------------------------------------------------------------------

  test("findOrderRowById retorna pedido com CPF decriptado", async () => {
    pool.query.mockResolvedValue([[{ pedido_id: 5, usuario_cpf: "encrypted:cpf" }]]);

    const row = await repo.findOrderRowById(5);

    expect(row.pedido_id).toBe(5);
    expect(row.usuario_cpf).toBe("12345678901");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE p.id = ?"), [5]);
  });

  test("findOrderRowById retorna null se não encontrado", async () => {
    pool.query.mockResolvedValue([[undefined]]);

    const row = await repo.findOrderRowById(999);

    expect(row).toBeNull();
  });

  // -----------------------------------------------------------------------
  // findOrderItemsById
  // -----------------------------------------------------------------------

  test("findOrderItemsById retorna itens do pedido", async () => {
    pool.query.mockResolvedValue([[{ pedido_id: 5, produto_nome: "Y" }]]);

    const items = await repo.findOrderItemsById(5);

    expect(items).toHaveLength(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE pp.pedido_id = ?"), [5]);
  });

  // -----------------------------------------------------------------------
  // setPaymentStatus
  // -----------------------------------------------------------------------

  test("setPaymentStatus retorna affectedRows", async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await repo.setPaymentStatus(10, "pago");

    expect(result).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status_pagamento"),
      ["pago", "pago", 10]
    );
  });

  test("setPaymentStatus retorna 0 se pedido não existe", async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await repo.setPaymentStatus(999, "pago");

    expect(result).toBe(0);
  });

  // -----------------------------------------------------------------------
  // setDeliveryStatus
  // -----------------------------------------------------------------------

  test("setDeliveryStatus aceita pool ou conn", async () => {
    const mockDb = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };

    const result = await repo.setDeliveryStatus(mockDb, 10, "enviado");

    expect(result).toBe(1);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status_entrega"),
      ["enviado", 10]
    );
  });

  // -----------------------------------------------------------------------
  // lockOrderForUpdate
  // -----------------------------------------------------------------------

  test("lockOrderForUpdate retorna row com status", async () => {
    const conn = { query: jest.fn().mockResolvedValue([[{ status_entrega: "processando", status_pagamento: "pendente" }]]) };

    const row = await repo.lockOrderForUpdate(conn, 10);

    expect(row.status_entrega).toBe("processando");
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [10]);
  });

  test("lockOrderForUpdate retorna null se pedido não existe", async () => {
    const conn = { query: jest.fn().mockResolvedValue([[undefined]]) };

    const row = await repo.lockOrderForUpdate(conn, 999);

    expect(row).toBeNull();
  });

  // -----------------------------------------------------------------------
  // restoreStock / restoreStockOnFailure
  // -----------------------------------------------------------------------

  test("restoreStock executa UPDATE JOIN no db passado", async () => {
    const db = { query: jest.fn().mockResolvedValue([{}]) };

    await repo.restoreStock(db, 10);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("quantity + pp.quantidade"),
      [10]
    );
  });

  test("restoreStockOnFailure executa UPDATE com guard de status_pagamento", async () => {
    const conn = { query: jest.fn().mockResolvedValue([{}]) };

    await repo.restoreStockOnFailure(conn, 10);

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("status_pagamento <> 'falhou'"),
      [10]
    );
  });
});
