"use strict";

jest.mock("../../../config/pool");
jest.mock("../../../repositories/paymentRepository");
jest.mock("../../../repositories/orderRepository");
jest.mock("../../../config/mercadopago", () => ({ getMPClient: jest.fn() }));
jest.mock("../../../lib/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../lib/sentry", () => ({
  init: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
// O service usa setImmediate + require lazy de comunicacaoService quando o
// pagamento é aprovado. Sem este mock, a notificação real é executada DEPOIS
// do teardown do Jest e crasha o process com TypeError. Mockamos para isolar.
jest.mock("../../../services/comunicacaoService", () => ({
  dispararEventoComunicacao: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("mercadopago", () => ({
  Payment: jest.fn().mockImplementation(() => ({ get: jest.fn() })),
}));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/paymentRepository");
const orderRepo = require("../../../repositories/orderRepository");
const sentry = require("../../../lib/sentry");
const { handleWebhookEvent, mapMPStatusToDomain, isStatusTransitionSafe } = require("../../../services/paymentWebhookService");

describe("paymentWebhookService", () => {
  let conn;

  // Drains any setImmediate queued by the "pago" notification path inside
  // handleWebhookEvent. Without this, the lazy require for comunicacaoService
  // can fire after Jest tears down the environment and crash the process.
  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

  beforeEach(() => {
    jest.clearAllMocks();

    conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([[]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(conn);

    // Default: order exists with status_pagamento = "pendente"
    // Tests that need a different status override this in-place.
    // Tests that simulate orphan order set this to null.
    repo.findPedidoForUpdate.mockResolvedValue({ id: 42, status_pagamento: "pendente" });
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

    test("R7 — replay 'falhou' não chama restoreStock duas vezes (no-op)", async () => {
      // Cenário: webhook MP entrega um evento com event_id NOVO (não duplicado
      // no banco), mas o pedido já está em status_pagamento='falhou' por causa
      // de um webhook anterior. O service deve detectar o no-op via comparação
      // currentStatus===novoStatus e PULAR restoreStockOnFailure inteiramente,
      // evitando que o estoque seja incrementado de novo.
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(50);
      repo.findPedidoForUpdate.mockResolvedValue({ id: 60, status_pagamento: "falhou" });
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "rejected",
          metadata: { pedidoId: 60 },
        }),
      }));

      const result = await handleWebhookEvent({ ...baseOpts, eventId: "evt-replay" });

      expect(result).toBe("processed");
      expect(orderRepo.restoreStockOnFailure).not.toHaveBeenCalled();
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
      expect(repo.markWebhookEventProcessed).toHaveBeenCalledWith(conn, 50, "falhou");
    });

    test("R7 — replay 'pago' também é no-op (não dispara comunicação duplicada)", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(51);
      repo.findPedidoForUpdate.mockResolvedValue({ id: 70, status_pagamento: "pago" });
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: { pedidoId: 70 },
        }),
      }));

      const result = await handleWebhookEvent({ ...baseOpts, eventId: "evt-replay-pago" });

      expect(result).toBe("processed");
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
      expect(repo.markWebhookEventProcessed).toHaveBeenCalledWith(conn, 51, "pago");
    });

    test("blocked transition — pago → falhou is prevented", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(20);
      repo.findPedidoForUpdate.mockResolvedValue({ id: 99, status_pagamento: "pago" });
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

    test("parked — pedido inexistente vira PARKED:PENDING_ORDER_MATCH", async () => {
      repo.findWebhookEventForUpdate.mockResolvedValue(null);
      repo.insertWebhookEvent.mockResolvedValue(30);
      // Chave do teste: pedido referenciado em metadata não existe.
      repo.findPedidoForUpdate.mockResolvedValue(null);
      const { Payment } = require("mercadopago");
      Payment.mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({
          status: "approved",
          metadata: { pedidoId: 999999 },
        }),
      }));

      const result = await handleWebhookEvent(baseOpts);

      expect(result).toBe("parked");
      expect(repo.markWebhookEventParkedPendingMatch).toHaveBeenCalledWith(
        conn, 30, 999999
      );
      // Caminho normal de update NÃO deve ter sido tocado.
      expect(repo.updatePedidoPayment).not.toHaveBeenCalled();
      expect(repo.markWebhookEventProcessed).not.toHaveBeenCalled();
      expect(orderRepo.restoreStockOnFailure).not.toHaveBeenCalled();
      // Sentry alertado com tag canônica de domínio.
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("inexistente"),
        "warning",
        expect.objectContaining({
          tags: expect.objectContaining({
            domain: "payment.webhook.parked_pending_order",
          }),
          extra: expect.objectContaining({ pedidoId: 999999 }),
        })
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
