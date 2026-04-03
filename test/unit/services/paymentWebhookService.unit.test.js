"use strict";

jest.mock("../../../config/pool");
jest.mock("../../../repositories/paymentRepository");
jest.mock("../../../repositories/orderRepository");
jest.mock("../../../config/mercadopago", () => ({ getMPClient: jest.fn() }));
jest.mock("mercadopago", () => ({
  Payment: jest.fn().mockImplementation(() => ({ get: jest.fn() })),
}));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/paymentRepository");
const orderRepo = require("../../../repositories/orderRepository");
const { handleWebhookEvent, mapMPStatusToDomain, isStatusTransitionSafe } = require("../../../services/paymentWebhookService");

describe("paymentWebhookService", () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();

    conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      // Default: conn.query returns a row with status_pagamento = "pendente"
      // (used by the status transition guard in handleWebhookEvent).
      query: jest.fn().mockResolvedValue([[{ status_pagamento: "pendente" }]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(conn);
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
    ])("'%s' → '%s'", (input, expected) => {
      expect(mapMPStatusToDomain(input)).toBe(expected);
    });
  });

  // -----------------------------------------------------------------------
  // handleWebhookEvent
  // -----------------------------------------------------------------------

  describe("handleWebhookEvent", () => {
    const baseOpts = { eventId: "evt-1", type: "payment", dataId: "pay-1", payload: "{}", signatureHeader: "sig" };

    test("idempotent — evento já processado", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue({ id: 1, processed_at: new Date() });
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("idempotent");
      expect(conn.commit).toHaveBeenCalled();
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
    });

    test("ignored — type != payment", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(5);
      const result = await handleWebhookEvent({ ...baseOpts, type: "plan", dataId: null });
      expect(result).toBe("ignored");
      expect(repo.markWebhookEventIgnored).toHaveBeenCalledWith(conn, 5);
    });

    test("ignored — sem dataId", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(6);
      const result = await handleWebhookEvent({ ...baseOpts, dataId: null });
      expect(result).toBe("ignored");
    });

    test("ignored — sem metadata.pedidoId", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(7);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({ get: jest.fn().mockResolvedValue({ status: "approved", metadata: {} }) }));
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("ignored");
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
    });

    test("processed — approved", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(10);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({ status: "approved", metadata: { pedidoId: 42 } }),
      }));
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("processed");
      expect(repo.updatePedidoPayment).toHaveBeenCalledWith(conn, 42, "pago", "pay-1");
      expect(orderRepo.restoreStockOnFailure).not.toHaveBeenCalled();
    });

    test("processed — rejected restaura estoque", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(11);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({ status: "rejected", metadata: { pedidoId: 50 } }),
      }));
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("processed");
      expect(orderRepo.restoreStockOnFailure).toHaveBeenCalledWith(conn, 50);
    });

    test("re-delivery — evento existente não processado", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue({ id: 99, processed_at: null });
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({ status: "approved", metadata: { pedidoId: 77 } }),
      }));
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("processed");
      expect(repo.markWebhookEventReceived).toHaveBeenCalledWith(conn, 99, expect.any(Object));
      expect(repo.insertWebhookEvent).not.toHaveBeenCalled();
    });

    test("rollback em erro e propaga exceção", async () => {
      repo.findWebhookEventForUpdate.mockRejectedValue(new Error("db crash"));
      await expect(handleWebhookEvent(baseOpts)).rejects.toThrow("db crash");
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test("rollback falho não esconde erro original", async () => {
      repo.findWebhookEventForUpdate.mockRejectedValue(new Error("original"));
      conn.rollback.mockRejectedValue(new Error("rollback failed"));
      await expect(handleWebhookEvent(baseOpts)).rejects.toThrow("original");
      expect(conn.release).toHaveBeenCalled();
    });

    test("blocked transition — pago → falhou is prevented", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(20);
      conn.query.mockResolvedValue([[{ status_pagamento: "pago" }]]);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({ status: "rejected", metadata: { pedidoId: 99 } }),
      }));
      const result = await handleWebhookEvent(baseOpts);
      expect(result).toBe("processed");
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
      expect(orderRepo.restoreStockOnFailure).not.toHaveBeenCalled();
      expect(repo.markWebhookEventProcessed).toHaveBeenCalledWith(
        conn, 20, "blocked:pago->falhou"
      );
    });

    test("transient MP API error throws with transient flag", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(21);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error("timeout")),
      }));
      await expect(handleWebhookEvent(baseOpts)).rejects.toMatchObject({
        transient: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // isStatusTransitionSafe
  // -----------------------------------------------------------------------

  describe("isStatusTransitionSafe", () => {
    test.each([
      ["pendente", "pago", true],
      ["pendente", "falhou", true],
      ["pendente", "estornado", true],
      ["falhou", "pago", true],
      ["falhou", "pendente", true],
      ["pago", "estornado", true],
      ["pago", "falhou", false],
      ["pago", "pendente", false],
      ["estornado", "pago", false],
      ["estornado", "falhou", false],
      ["estornado", "pendente", false],
      ["pago", "pago", true],
    ])("%s → %s = %s", (from, to, expected) => {
      expect(isStatusTransitionSafe(from, to)).toBe(expected);
    });
  });
});
