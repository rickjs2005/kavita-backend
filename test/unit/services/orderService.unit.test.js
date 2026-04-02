"use strict";

jest.mock("../../../config/pool", () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock("../../../repositories/orderRepository");
jest.mock("../../../services/comunicacaoService", () => ({
  dispararEventoComunicacao: jest.fn().mockResolvedValue(undefined),
}));

const pool = require("../../../config/pool");
const orderRepo = require("../../../repositories/orderRepository");
const comunicacao = require("../../../services/comunicacaoService");
const orderService = require("../../../services/orderService");

describe("orderService", () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();

    conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(conn);
  });

  test("listOrders retorna { pedidos, itens } crus", async () => {
    orderRepo.findAllOrderRows.mockResolvedValue([{ pedido_id: 1 }]);
    orderRepo.findAllOrderItems.mockResolvedValue([{ pedido_id: 1, nome: "X" }]);
    const result = await orderService.listOrders();
    expect(result.pedidos).toHaveLength(1);
    expect(result.itens).toHaveLength(1);
  });

  test("getOrderById retorna null se não existe", async () => {
    orderRepo.findOrderRowById.mockResolvedValue(null);
    const result = await orderService.getOrderById(999);
    expect(result).toBeNull();
    expect(orderRepo.findOrderItemsById).not.toHaveBeenCalled();
  });

  test("getOrderById retorna { pedido, itens }", async () => {
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
    test("rejeita status inválido", async () => {
      await expect(orderService.updatePaymentStatus(1, "invalido")).rejects.toMatchObject({ status: 400 });
    });

    test("retorna { found: false } se pedido não existe", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(0);
      const result = await orderService.updatePaymentStatus(1, "pendente");
      expect(result).toEqual({ found: false });
      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
    });

    test("dispara pagamento_aprovado quando pago", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(1);
      const result = await orderService.updatePaymentStatus(42, "pago");
      expect(result).toEqual({ found: true });
      expect(comunicacao.dispararEventoComunicacao).toHaveBeenCalledWith("pagamento_aprovado", 42);
    });

    test("NÃO dispara evento para status != pago", async () => {
      orderRepo.setPaymentStatus.mockResolvedValue(1);
      await orderService.updatePaymentStatus(1, "falhou");
      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
    });

    test("erro na comunicação não impede retorno", async () => {
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
    test("rejeita status inválido", async () => {
      await expect(orderService.updateDeliveryStatus(1, "invalido")).rejects.toMatchObject({ status: 400 });
    });

    test("cancelado — restaura estoque quando não cancelado e não falhou", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({ status_entrega: "processando", status_pagamento: "pendente" });
      const result = await orderService.updateDeliveryStatus(1, "cancelado");
      expect(result).toEqual({ found: true });
      expect(orderRepo.restoreStock).toHaveBeenCalledWith(conn, 1);
      expect(orderRepo.setDeliveryStatus).toHaveBeenCalledWith(conn, 1, "cancelado");
      expect(conn.commit).toHaveBeenCalled();
    });

    test("cancelado — NÃO restaura se já cancelado", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({ status_entrega: "cancelado", status_pagamento: "pendente" });
      await orderService.updateDeliveryStatus(1, "cancelado");
      expect(orderRepo.restoreStock).not.toHaveBeenCalled();
    });

    test("cancelado — NÃO restaura se pagamento falhou", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue({ status_entrega: "processando", status_pagamento: "falhou" });
      await orderService.updateDeliveryStatus(1, "cancelado");
      expect(orderRepo.restoreStock).not.toHaveBeenCalled();
    });

    test("cancelado — retorna { found: false } se não existe", async () => {
      orderRepo.lockOrderForUpdate.mockResolvedValue(null);
      const result = await orderService.updateDeliveryStatus(1, "cancelado");
      expect(result).toEqual({ found: false });
      // withTransaction commits (empty transaction), not rollback
      expect(conn.commit).toHaveBeenCalled();
    });

    test("cancelado — rollback em erro", async () => {
      orderRepo.lockOrderForUpdate.mockRejectedValue(new Error("deadlock"));
      await expect(orderService.updateDeliveryStatus(1, "cancelado")).rejects.toThrow("deadlock");
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test("enviado — dispara pedido_enviado", async () => {
      orderRepo.setDeliveryStatus.mockResolvedValue(1);
      const result = await orderService.updateDeliveryStatus(1, "enviado");
      expect(result).toEqual({ found: true });
      expect(comunicacao.dispararEventoComunicacao).toHaveBeenCalledWith("pedido_enviado", 1);
    });

    test("enviado — erro na comunicação não impede retorno", async () => {
      orderRepo.setDeliveryStatus.mockResolvedValue(1);
      comunicacao.dispararEventoComunicacao.mockRejectedValue(new Error("smtp down"));
      const result = await orderService.updateDeliveryStatus(1, "enviado");
      expect(result).toEqual({ found: true });
    });

    test("status normal — sem evento, sem transação", async () => {
      orderRepo.setDeliveryStatus.mockResolvedValue(1);
      await orderService.updateDeliveryStatus(1, "processando");
      expect(comunicacao.dispararEventoComunicacao).not.toHaveBeenCalled();
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });
});
