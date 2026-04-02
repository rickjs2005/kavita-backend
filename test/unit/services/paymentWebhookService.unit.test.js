"use strict";

const poolPath = require.resolve("../../../config/pool");
const repoPath = require.resolve("../../../repositories/paymentRepository");
const orderRepoPath = require.resolve("../../../repositories/orderRepository");
const mpConfigPath = require.resolve("../../../config/mercadopago");

describe("paymentWebhookService", () => {
  let handleWebhookEvent, mapMPStatusToDomain;
  let repo, orderRepo, conn;

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
      getConnection: jest.fn().mockResolvedValue(conn),
    }));

    jest.doMock(repoPath, () => ({
      findWebhookEventForUpdate: jest.fn(),
      insertWebhookEvent: jest.fn(),
      markWebhookEventReceived: jest.fn(),
      markWebhookEventIgnored: jest.fn(),
      markWebhookEventProcessed: jest.fn(),
      updatePedidoPayment: jest.fn(),
    }));

    jest.doMock(orderRepoPath, () => ({
      restoreStockOnFailure: jest.fn(),
    }));

    // Mock mercadopago Payment class
    jest.doMock("mercadopago", () => ({
      Payment: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
      })),
    }));

    jest.doMock(mpConfigPath, () => ({
      getMPClient: jest.fn(),
    }));

    const svc = require("../../../services/paymentWebhookService");
    handleWebhookEvent = svc.handleWebhookEvent;
    mapMPStatusToDomain = svc.mapMPStatusToDomain;
    repo = require(repoPath);
    orderRepo = require(orderRepoPath);
  });

  // -----------------------------------------------------------------------
  // mapMPStatusToDomain
  // -----------------------------------------------------------------------

  describe("mapMPStatusToDomain", () => {
    test.each([
      ["approved", "pago"],
      ["rejected", "falhou"],
      ["cancelled", "falhou"],
      ["in_process", "pendente"],
      ["pending", "pendente"],
      ["charged_back", "estornado"],
      ["refunded", "estornado"],
      ["unknown_status", "pendente"],
    ])("mapeia '%s' → '%s'", (input, expected) => {
      expect(mapMPStatusToDomain(input)).toBe(expected);
    });
  });

  // -----------------------------------------------------------------------
  // handleWebhookEvent — idempotência
  // -----------------------------------------------------------------------

  describe("handleWebhookEvent", () => {
    test("retorna 'idempotent' se evento já foi processado", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue({
        id: 1,
        processed_at: new Date(),
      });

      const result = await handleWebhookEvent({
        eventId: "evt-1",
        type: "payment",
        dataId: "123",
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("idempotent");
      expect(conn.commit).toHaveBeenCalled();
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
    });

    test("retorna 'ignored' se type não é 'payment'", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(5);

      const result = await handleWebhookEvent({
        eventId: "evt-2",
        type: "plan",
        dataId: null,
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("ignored");
      expect(repo.markWebhookEventIgnored).toHaveBeenCalledWith(conn, 5);
      expect(conn.commit).toHaveBeenCalled();
    });

    test("retorna 'ignored' se dataId ausente", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(6);

      const result = await handleWebhookEvent({
        eventId: "evt-3",
        type: "payment",
        dataId: null,
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("ignored");
    });

    test("processa pagamento approved e retorna 'processed'", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(10);

      // Mock MP Payment.get()
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: { pedidoId: 42 },
        }),
      }));

      const result = await handleWebhookEvent({
        eventId: "evt-4",
        type: "payment",
        dataId: "pay-999",
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("processed");
      expect(repo.updatePedidoPayment).toHaveBeenCalledWith(conn, 42, "pago", "pay-999");
      expect(repo.markWebhookEventProcessed).toHaveBeenCalledWith(conn, 10, "pago");
      expect(orderRepo.restoreStockOnFailure).not.toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
    });

    test("restaura estoque quando status é 'falhou'", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(11);

      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "rejected",
          metadata: { pedidoId: 50 },
        }),
      }));

      const result = await handleWebhookEvent({
        eventId: "evt-5",
        type: "payment",
        dataId: "pay-888",
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("processed");
      expect(orderRepo.restoreStockOnFailure).toHaveBeenCalledWith(conn, 50);
      expect(repo.updatePedidoPayment).toHaveBeenCalledWith(conn, 50, "falhou", "pay-888");
    });

    test("re-delivery: evento existente não processado → marca received e continua", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue({ id: 99, processed_at: null });

      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: { pedidoId: 77 },
        }),
      }));

      const result = await handleWebhookEvent({
        eventId: "evt-redelivery",
        type: "payment",
        dataId: "pay-555",
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("processed");
      expect(repo.markWebhookEventReceived).toHaveBeenCalledWith(conn, 99, expect.any(Object));
      expect(repo.insertWebhookEvent).not.toHaveBeenCalled();
    });

    test("rollback falho é capturado sem impedir propagação do erro original", async () => {
      repo.findWebhookEventForUpdate.mockRejectedValue(new Error("original error"));
      conn.rollback.mockRejectedValue(new Error("rollback failed"));

      await expect(
        handleWebhookEvent({
          eventId: "evt-double-fail",
          type: "payment",
          dataId: "1",
          payload: "{}",
          signatureHeader: "sig",
        })
      ).rejects.toThrow("original error");

      expect(conn.release).toHaveBeenCalled();
    });

    test("faz rollback em erro e propaga exceção", async () => {
      repo.findWebhookEventForUpdate.mockRejectedValue(new Error("db crash"));

      await expect(
        handleWebhookEvent({
          eventId: "evt-err",
          type: "payment",
          dataId: "1",
          payload: "{}",
          signatureHeader: "sig",
        })
      ).rejects.toThrow("db crash");

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test("retorna 'ignored' se pagamento sem metadata.pedidoId", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(12);

      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: {},
        }),
      }));

      const result = await handleWebhookEvent({
        eventId: "evt-6",
        type: "payment",
        dataId: "pay-777",
        payload: "{}",
        signatureHeader: "sig",
      });

      expect(result).toBe("ignored");
      expect(repo.markWebhookEventIgnored).toHaveBeenCalled();
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
    });
  });
});
