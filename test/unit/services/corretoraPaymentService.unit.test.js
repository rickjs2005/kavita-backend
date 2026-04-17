/**
 * test/unit/services/corretoraPaymentService.unit.test.js
 *
 * Cobre a camada de orquestração:
 *   - isGatewayActive / getDefaultAdapter reagem a env
 *   - ingestWebhook: dedupe via repo (INSERT IGNORE), assinatura inválida,
 *     payload não traduzido, evento ignored
 *   - markEventProcessed / markEventFailed delegam ao repo
 *
 * Mocks: webhookEventsRepository + asaasAdapter (para controlar
 * retornos sem rede).
 */

describe("services/corretoraPaymentService", () => {
  const webhookRepoPath = require.resolve(
    "../../../repositories/webhookEventsRepository",
  );
  const asaasAdapterPath = require.resolve(
    "../../../services/payment/asaasAdapter",
  );

  let svc;
  let webhookRepo;
  let asaas;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    webhookRepo = {
      recordIfNew: jest.fn(),
      markProcessed: jest.fn().mockResolvedValue(1),
      markFailed: jest.fn().mockResolvedValue(1),
    };
    asaas = {
      PROVIDER: "asaas",
      isConfigured: jest.fn(() => false),
      upsertCustomer: jest.fn(),
      createSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      verifySignature: jest.fn(() => true),
      translateWebhookEvent: jest.fn(),
    };

    jest.doMock(webhookRepoPath, () => webhookRepo);
    jest.doMock(asaasAdapterPath, () => asaas);

    svc = require("../../../services/corretoraPaymentService");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isGatewayActive", () => {
    it("retorna false quando adapter não está configurado", () => {
      asaas.isConfigured.mockReturnValue(false);
      expect(svc.isGatewayActive()).toBe(false);
    });

    it("retorna true quando adapter está configurado", () => {
      asaas.isConfigured.mockReturnValue(true);
      expect(svc.isGatewayActive()).toBe(true);
    });

    it("getAdapter retorna null para provider desconhecido", () => {
      expect(svc.getAdapter("pagarme")).toBe(null);
      expect(svc.getAdapter("")).toBe(null);
      expect(svc.getAdapter(null)).toBe(null);
    });

    it("getAdapter retorna o adapter asaas quando solicitado", () => {
      expect(svc.getAdapter("asaas")).toBe(asaas);
      expect(svc.getAdapter("Asaas")).toBe(asaas);
    });
  });

  describe("ingestWebhook", () => {
    const reqBase = { ip: "1.2.3.4", body: { event: "PAYMENT_CONFIRMED" } };

    it("rejeita provider desconhecido com 400", async () => {
      await expect(
        svc.ingestWebhook({ provider: "desconhecido", req: reqBase }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("rejeita assinatura inválida com 401", async () => {
      asaas.verifySignature.mockReturnValue(false);
      await expect(
        svc.ingestWebhook({ provider: "asaas", req: reqBase }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("retorna untranslatable sem persistir quando adapter não traduz", async () => {
      asaas.verifySignature.mockReturnValue(true);
      asaas.translateWebhookEvent.mockReturnValue(null);

      const res = await svc.ingestWebhook({
        provider: "asaas",
        req: reqBase,
      });
      expect(res).toEqual({ stored: false, domainEvent: null });
      expect(webhookRepo.recordIfNew).not.toHaveBeenCalled();
    });

    it("registra evento novo e devolve domainEvent + webhookEventId", async () => {
      asaas.verifySignature.mockReturnValue(true);
      asaas.translateWebhookEvent.mockReturnValue({
        type: "payment_confirmed",
        provider: "asaas",
        provider_event_id: "evt_new_1",
        raw_event: "PAYMENT_CONFIRMED",
        payment_id: "pay_1",
        subscription_id: "sub_1",
        meta: { value: 100 },
      });
      webhookRepo.recordIfNew.mockResolvedValue({
        id: 42,
        inserted: true,
      });

      const res = await svc.ingestWebhook({
        provider: "asaas",
        req: reqBase,
      });

      expect(res.stored).toBe(true);
      expect(res.duplicate).toBe(false);
      expect(res.webhookEventId).toBe(42);
      expect(res.domainEvent.type).toBe("payment_confirmed");
      expect(webhookRepo.recordIfNew).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "asaas",
          provider_event_id: "evt_new_1",
          event_type: "PAYMENT_CONFIRMED",
        }),
      );
    });

    it("detecta duplicata (INSERT IGNORE) e responde sem domainEvent", async () => {
      asaas.verifySignature.mockReturnValue(true);
      asaas.translateWebhookEvent.mockReturnValue({
        type: "payment_confirmed",
        provider: "asaas",
        provider_event_id: "evt_dup",
        raw_event: "PAYMENT_CONFIRMED",
        payment_id: "pay_2",
        subscription_id: "sub_2",
        meta: {},
      });
      webhookRepo.recordIfNew.mockResolvedValue({
        id: null,
        inserted: false,
      });

      const res = await svc.ingestWebhook({
        provider: "asaas",
        req: reqBase,
      });

      expect(res).toEqual({
        stored: false,
        duplicate: true,
        domainEvent: null,
      });
    });

    it("evento 'ignored' (SUBSCRIPTION_UPDATED etc.) ainda é persistido para auditoria", async () => {
      asaas.verifySignature.mockReturnValue(true);
      asaas.translateWebhookEvent.mockReturnValue({
        type: "ignored",
        provider: "asaas",
        provider_event_id: "evt_ign",
        raw_event: "SUBSCRIPTION_UPDATED",
        payment_id: null,
        subscription_id: "sub_ign",
        meta: {},
      });
      webhookRepo.recordIfNew.mockResolvedValue({
        id: 7,
        inserted: true,
      });

      const res = await svc.ingestWebhook({
        provider: "asaas",
        req: reqBase,
      });
      expect(res.stored).toBe(true);
      expect(res.domainEvent.type).toBe("ignored");
      expect(webhookRepo.recordIfNew).toHaveBeenCalled();
    });
  });

  describe("markEventProcessed / markEventFailed", () => {
    it("delega para webhookEventsRepo.markProcessed", async () => {
      await svc.markEventProcessed(10);
      expect(webhookRepo.markProcessed).toHaveBeenCalledWith(10);
    });

    it("delega para webhookEventsRepo.markFailed com mensagem de erro", async () => {
      await svc.markEventFailed(11, new Error("boom"));
      expect(webhookRepo.markFailed).toHaveBeenCalledWith(11, expect.any(Error));
    });
  });

  describe("createCheckoutForCorretora", () => {
    it("lança 503 quando gateway não está configurado", async () => {
      asaas.isConfigured.mockReturnValue(false);
      await expect(
        svc.createCheckoutForCorretora({
          corretora: { id: 1 },
          plan: { price_cents: 9900 },
        }),
      ).rejects.toMatchObject({ status: 503 });
    });

    it("lança 400 quando plano não tem price_cents positivo", async () => {
      asaas.isConfigured.mockReturnValue(true);
      await expect(
        svc.createCheckoutForCorretora({
          corretora: { id: 1 },
          plan: { price_cents: 0 },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("orquestra upsertCustomer + createSubscription e devolve payload normalizado", async () => {
      asaas.isConfigured.mockReturnValue(true);
      asaas.upsertCustomer.mockResolvedValue("cus_abc");
      asaas.createSubscription.mockResolvedValue({
        subscription_id: "sub_xyz",
        status: "ACTIVE",
        next_due_date: "2026-05-18",
        checkout_url: "https://asaas/link",
      });

      const res = await svc.createCheckoutForCorretora({
        corretora: {
          id: 42,
          name: "Corretora X",
          email: "x@x.com",
          whatsapp: "33999999999",
        },
        plan: {
          id: 2,
          slug: "pro",
          name: "Pro",
          price_cents: 4900,
          billing_cycle: "monthly",
        },
      });

      expect(asaas.upsertCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          corretoraId: 42,
          name: "Corretora X",
          email: "x@x.com",
          phone: "33999999999",
        }),
      );
      expect(asaas.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "cus_abc",
          valueCents: 4900,
          cycle: "monthly",
        }),
      );
      expect(res).toEqual({
        provider: "asaas",
        customer_id: "cus_abc",
        subscription_id: "sub_xyz",
        checkout_url: "https://asaas/link",
        next_due_date: "2026-05-18",
      });
    });
  });
});
