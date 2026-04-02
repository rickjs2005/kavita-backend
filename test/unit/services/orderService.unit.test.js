"use strict";

const poolPath = require.resolve("../../../config/pool");
const orderRepoPath = require.resolve("../../../repositories/orderRepository");
const comunicacaoPath = require.resolve("../../../services/comunicacaoService");

describe("orderService", () => {
  let orderService, orderRepo, comunicacao, pool, conn;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(conn),
    }));

    jest.doMock(orderRepoPath, () => ({
      findAllOrderRows: jest.fn(),
      findAllOrderItems: jest.fn(),
      findOrderRowById: jest.fn(),
      findOrderItemsById: jest.fn(),
      setPaymentStatus: jest.fn(),
      setDeliveryStatus: jest.fn(),
      lockOrderForUpdate: jest.fn(),
      restoreStock: jest.fn(),
    }));

    jest.doMock(comunicacaoPath, () => ({
      dispararEventoComunicacao: jest.fn().mockResolvedValue(undefined),
    }));

    orderService = require("../../../services/orderService");
    orderRepo = require(orderRepoPath);
    comunicacao = require(comunicacaoPath);
    pool = require(poolPath);
  });

  // -----------------------------------------------------------------------
  // listOrders / getOrderById
  // -----------------------------------------------------------------------

  test("listOrders retorna { pedidos, itens } crus do repo", async () => {
    orderRepo.findAllOrderRows.mockResolvedValue([{ pedido_id: 1 }]);
    orderRepo.findAllOrderItems.mockResolvedValue([{ pedido_id: 1, nome: "X" }]);

    const result = await orderService.listOrders();

    expect(result.pedidos).toHaveLength(1);
    expect(result.itens).toHaveLength(1);
  });

  test("getOrderById retorna null se pedido não existe", async () => {
    orderRepo.findOrderRowById.mockResolvedValue(null);

    const result = await orderService.getOrderById(999);

    expect(result).toBeNull();
    expect(orderRepo.findOrderItemsById).not.toHaveBeenCalled();
  });

  test("getOrderById retorna { pedido, itens } se encontrado", async () => {
    orderRepo.findOrderRowById.mockResolvedValue({ pedido_id: 1 });
    orderRepo.findOrderItemsById.mockResolvedValue([{ nome: "P1" }]);

    const result = await orderService.getOrderById(1);

    expect(result.pedido.pedido_id).toBe(1);
    expect(result.itens).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // updatePaymentStatus
  // -----------------------------------------------------------------------

  describe("updatePaymentStatus", () => {
    test("rejeita status inválido com AppError 400", async () => {
      await expect(
        orderService.updatePaymentStatus(1, "invalido")
      ).rejects.toMatchObject({ status: 400 });
    });

    test("retorna { found: false } se pedido não existe", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(0);

      const result = await orderService.updatePaymentStatus(1, "pendente");

      expect(result).toEqual({ found: false });
      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
    });

    test("dispara pagamento_aprovado quando status = 'pago'", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(1);

      const result = await orderService.updatePaymentStatus(42, "pago");

      expect(result).toEqual({ found: true });
      expect(comunicacao.dispararEventoComunicacao).toHaveBeenCalledWith(
        "pagamento_aprovado",
        42
      );
    });

    test("NÃO dispara evento para status != 'pago'", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(1);

      await orderService.updatePaymentStatus(1, "falhou");

      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
    });

    test("erro na comunicação não impede retorno { found: true }", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(1);
      comunicacao.dispararEventoComunicacao.mockRejectedValue(new Error("email down"));

      const result = await orderService.updatePaymentStatus(1, "pago");

      expect(result).toEqual({ found: true });
    });
  });

  // -----------------------------------------------------------------------
  // updateDeliveryStatus
  // -----------------------------------------------------------------------

  describe("updateDeliveryStatus", () => {
    test("rejeita status inválido com AppError 400", async () => {
      await expect(
        orderService.updateDeliveryStatus(1, "invalido")
      ).rejects.toMatchObject({ status: 400 });
    });

    test("'cancelado' — restaura estoque quando não cancelado e não falhou", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({
        status_entrega: "processando",
        status_pagamento: "pendente",
      });

      const result = await orderService.updateDeliveryStatus(1, "cancelado");

      expect(result).toEqual({ found: true });
      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(orderRepo.restoreStock).toHaveBeenCalledWith(conn, 1);
      expect(orderRepo.setDeliveryStatus).toHaveBeenCalledWith(conn, 1, "cancelado");
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test("'cancelado' — NÃO restaura estoque se já cancelado (idempotência)", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({
        status_entrega: "cancelado",
        status_pagamento: "pendente",
      });

      await orderService.updateDeliveryStatus(1, "cancelado");

      expect(orderRepo.restoreStock).not.toHaveBeenCalled();
      expect(orderRepo.setDeliveryStatus).toHaveBeenCalled();
    });

    test("'cancelado' — NÃO restaura estoque se pagamento falhou (webhook já restaurou)", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({
        status_entrega: "processando",
        status_pagamento: "falhou",
      });

      await orderService.updateDeliveryStatus(1, "cancelado");

      expect(orderRepo.restoreStock).not.toHaveBeenCalled();
    });

    test("'cancelado' — retorna { found: false } se pedido não existe", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue(null);

      const result = await orderService.updateDeliveryStatus(1, "cancelado");

      expect(result).toEqual({ found: false });
      expect(conn.rollback).toHaveBeenCalled();
    });

    test("'cancelado' — faz rollback em erro e propaga exceção", async () => {
      orderRepo.lockOrderForUpdate.mockRejectedValue(new Error("deadlock"));

      await expect(
        orderService.updateDeliveryStatus(1, "cancelado")
      ).rejects.toThrow("deadlock");

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test("'enviado' — dispara pedido_enviado", async () => {
      orderRepo.setDeliveryStatus.mockResolvedValue(1);

      const result = await orderService.updateDeliveryStatus(1, "enviado");

      expect(result).toEqual({ found: true });
      expect(comunicacao.dispararEventoComunicacao).toHaveBeenCalledWith(
        "pedido_enviado",
        1
      );
    });

    test("status normal (não cancelado, não enviado) — sem evento", async () => {
      orderRepo.setDeliveryStatus.mockResolvedValue(1);

      await orderService.updateDeliveryStatus(1, "processando");

      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });
});
