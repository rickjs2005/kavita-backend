/**
 * test/unit/services/asaasDomainHandler.unit.test.js
 *
 * ETAPA 1.2/1.3 — handler de domínio que aplica transições de
 * subscription a partir do domainEvent traduzido do Asaas.
 */

describe("services/payment/asaasDomainHandler", () => {
  const subsRepoPath = require.resolve(
    "../../../repositories/subscriptionsRepository",
  );
  const subEventsRepoPath = require.resolve(
    "../../../repositories/subscriptionEventsRepository",
  );

  let handler;
  let subsRepo;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(subsRepoPath, () => ({
      findByProviderSubscription: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
    }));
    jest.doMock(subEventsRepoPath, () => ({
      create: jest.fn().mockResolvedValue(undefined),
    }));

    subsRepo = require(subsRepoPath);
    handler = require("../../../services/payment/asaasDomainHandler");

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  it("retorna applied=false quando domainEvent é null/sem type", async () => {
    const r = await handler.applyDomainEvent(null);
    expect(r.applied).toBe(false);
  });

  it("pula eventos do tipo 'ignored'", async () => {
    const r = await handler.applyDomainEvent({
      type: "ignored",
      provider_subscription_id: "sub-1",
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("ignored_by_adapter");
  });

  it("retorna subscription_not_found quando subscription não existe", async () => {
    subsRepo.findByProviderSubscription.mockResolvedValue(null);
    const r = await handler.applyDomainEvent({
      type: "payment_confirmed",
      provider_subscription_id: "sub-999",
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("subscription_not_found");
    expect(subsRepo.update).not.toHaveBeenCalled();
  });

  it("payment_confirmed → active + zera pending_checkout", async () => {
    subsRepo.findByProviderSubscription.mockResolvedValue({
      id: 42,
      corretora_id: 10,
      plan_id: 3,
      status: "trialing",
    });
    const r = await handler.applyDomainEvent({
      type: "payment_confirmed",
      provider_subscription_id: "sub-42",
    });
    expect(r.applied).toBe(true);
    expect(r.subscription_id).toBe(42);
    expect(subsRepo.update).toHaveBeenCalledWith(42, {
      status: "active",
      provider_status: "active",
      pending_checkout_url: null,
      pending_checkout_at: null,
    });
  });

  it("payment_overdue → past_due", async () => {
    subsRepo.findByProviderSubscription.mockResolvedValue({
      id: 42,
      corretora_id: 10,
      plan_id: 3,
      status: "active",
    });
    await handler.applyDomainEvent({
      type: "payment_overdue",
      provider_subscription_id: "sub-42",
    });
    expect(subsRepo.update).toHaveBeenCalledWith(42, {
      status: "past_due",
      provider_status: "overdue",
    });
  });

  it("subscription_canceled → canceled com canceled_at", async () => {
    subsRepo.findByProviderSubscription.mockResolvedValue({
      id: 42,
      corretora_id: 10,
      plan_id: 3,
      status: "active",
    });
    await handler.applyDomainEvent({
      type: "subscription_canceled",
      provider_subscription_id: "sub-42",
    });
    const callArgs = subsRepo.update.mock.calls[0];
    expect(callArgs[0]).toBe(42);
    expect(callArgs[1]).toMatchObject({
      status: "canceled",
      provider_status: "canceled",
    });
    expect(callArgs[1].canceled_at).toBeInstanceOf(Date);
  });

  it("tipo desconhecido retorna unhandled_type sem atualizar", async () => {
    subsRepo.findByProviderSubscription.mockResolvedValue({
      id: 42,
      corretora_id: 10,
      plan_id: 3,
      status: "active",
    });
    const r = await handler.applyDomainEvent({
      type: "some_unknown_type",
      provider_subscription_id: "sub-42",
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/^unhandled_type/);
    expect(subsRepo.update).not.toHaveBeenCalled();
  });
});
