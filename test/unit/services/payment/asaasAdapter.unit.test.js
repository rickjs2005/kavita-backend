/**
 * test/unit/services/payment/asaasAdapter.unit.test.js
 *
 * Cobre camada pura do adapter Asaas (sem rede):
 *   - isConfigured
 *   - verifySignature (HMAC constant-time)
 *   - translateWebhookEvent (mapeamento de eventos)
 *   - NotConfiguredError quando apiKey ausente
 *
 * Chamadas HTTP (upsertCustomer, createSubscription, cancelSubscription)
 * ficam para teste de integração com mock de fetch — fora do escopo
 * desta Etapa B que valida só arquitetura.
 */

describe("services/payment/asaasAdapter", () => {
  let adapter;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    // Limpa env — cada teste configura o que precisa.
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_API_URL;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    adapter = require("../../../../services/payment/asaasAdapter");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("PROVIDER", () => {
    it("exporta identificador 'asaas'", () => {
      expect(adapter.PROVIDER).toBe("asaas");
    });
  });

  describe("isConfigured", () => {
    it("retorna false quando ASAAS_API_KEY está ausente", () => {
      expect(adapter.isConfigured()).toBe(false);
    });

    it("retorna true quando ASAAS_API_KEY está definida", () => {
      process.env.ASAAS_API_KEY = "chave-dev-fake";
      jest.resetModules();
      const freshAdapter = require("../../../../services/payment/asaasAdapter");
      expect(freshAdapter.isConfigured()).toBe(true);
    });
  });

  describe("verifySignature", () => {
    function fakeReq(headerValue) {
      return {
        get: (name) =>
          name.toLowerCase() === "asaas-access-token" ? headerValue : null,
      };
    }

    it("retorna false quando ASAAS_WEBHOOK_TOKEN não está configurado", () => {
      expect(adapter.verifySignature(fakeReq("qualquer"))).toBe(false);
    });

    it("retorna true quando header bate com o token", () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-de-teste";
      jest.resetModules();
      const a = require("../../../../services/payment/asaasAdapter");
      expect(a.verifySignature(fakeReq("segredo-de-teste"))).toBe(true);
    });

    it("retorna false quando header não bate", () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-de-teste";
      jest.resetModules();
      const a = require("../../../../services/payment/asaasAdapter");
      expect(a.verifySignature(fakeReq("valor-errado"))).toBe(false);
    });

    it("retorna false quando header está ausente", () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-de-teste";
      jest.resetModules();
      const a = require("../../../../services/payment/asaasAdapter");
      expect(a.verifySignature(fakeReq(null))).toBe(false);
      expect(a.verifySignature({ get: () => undefined })).toBe(false);
    });

    it("retorna false para header com tamanho diferente (early-exit, evita timingSafeEqual throw)", () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-longo";
      jest.resetModules();
      const a = require("../../../../services/payment/asaasAdapter");
      expect(a.verifySignature(fakeReq("x"))).toBe(false);
    });
  });

  describe("translateWebhookEvent", () => {
    it("retorna null para payload inválido", () => {
      expect(adapter.translateWebhookEvent(null)).toBe(null);
      expect(adapter.translateWebhookEvent(undefined)).toBe(null);
      expect(adapter.translateWebhookEvent("string")).toBe(null);
      expect(adapter.translateWebhookEvent({})).toBe(null);
    });

    it("mapeia PAYMENT_CONFIRMED → payment_confirmed", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_001",
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_001",
          subscription: "sub_001",
          value: 99.9,
        },
      });
      expect(out).toMatchObject({
        type: "payment_confirmed",
        provider: "asaas",
        provider_event_id: "evt_001",
        raw_event: "PAYMENT_CONFIRMED",
        payment_id: "pay_001",
        subscription_id: "sub_001",
      });
      expect(out.meta).toEqual({ value: 99.9 });
    });

    it("mapeia PAYMENT_RECEIVED também → payment_confirmed (apelido Asaas)", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_002",
        event: "PAYMENT_RECEIVED",
        payment: { id: "pay_002", value: 50 },
      });
      expect(out.type).toBe("payment_confirmed");
    });

    it("mapeia PAYMENT_OVERDUE → payment_overdue", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_003",
        event: "PAYMENT_OVERDUE",
        payment: { id: "pay_003" },
      });
      expect(out.type).toBe("payment_overdue");
    });

    it("mapeia PAYMENT_REFUNDED → payment_refunded", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_004",
        event: "PAYMENT_REFUNDED",
        payment: { id: "pay_004", value: 120 },
      });
      expect(out.type).toBe("payment_refunded");
      expect(out.meta).toEqual({ value: 120 });
    });

    it("mapeia SUBSCRIPTION_DELETED → subscription_canceled", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_005",
        event: "SUBSCRIPTION_DELETED",
        subscription: { id: "sub_005" },
      });
      expect(out.type).toBe("subscription_canceled");
      expect(out.subscription_id).toBe("sub_005");
    });

    it("evento desconhecido vira type: ignored (auditoria preservada)", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_006",
        event: "SUBSCRIPTION_UPDATED",
        subscription: { id: "sub_006" },
      });
      expect(out.type).toBe("ignored");
      expect(out.raw_event).toBe("SUBSCRIPTION_UPDATED");
    });

    it("aceita subscription como string direto (payload legado)", () => {
      const out = adapter.translateWebhookEvent({
        id: "evt_007",
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_007", subscription: "sub_inline" },
      });
      expect(out.subscription_id).toBe("sub_inline");
    });

    it("fallback de provider_event_id quando id está ausente", () => {
      const out = adapter.translateWebhookEvent({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_009" },
        dateCreated: "2026-04-18",
      });
      expect(out.provider_event_id).toContain("PAYMENT_CONFIRMED");
      expect(out.provider_event_id).toContain("pay_009");
    });

    it("não lança quando payload vem quebrado", () => {
      expect(() => adapter.translateWebhookEvent({ event: "X" })).not.toThrow();
    });
  });

  describe("chamadas de rede sem apiKey", () => {
    it("upsertCustomer lança NotConfiguredError", async () => {
      await expect(
        adapter.upsertCustomer({
          corretoraId: 1,
          name: "Teste",
          email: "t@t.com",
        }),
      ).rejects.toThrow(/configurado/i);
    });

    it("createSubscription lança NotConfiguredError", async () => {
      await expect(
        adapter.createSubscription({
          customerId: "cus_x",
          valueCents: 1000,
          cycle: "monthly",
        }),
      ).rejects.toThrow(/configurado/i);
    });

    it("cancelSubscription lança NotConfiguredError", async () => {
      await expect(adapter.cancelSubscription("sub_x")).rejects.toThrow(
        /configurado/i,
      );
    });
  });
});
