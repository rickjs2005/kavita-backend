/**
 * test/unit/services/planService.unit.test.js
 *
 * Cobre:
 *   - hasCapability (boolean + limite numérico)
 *   - getPlanContext (subscription ativa + fallback Free)
 *   - assignPlan (transacional: cancelar anterior + criar nova)
 */

describe("services/planService", () => {
  const plansRepoPath = require.resolve(
    "../../../repositories/plansRepository",
  );
  const subsRepoPath = require.resolve(
    "../../../repositories/subscriptionsRepository",
  );
  const withTxPath = require.resolve("../../../lib/withTransaction");

  let svc;
  let plansRepo;
  let subsRepo;
  let connMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    connMock = { query: jest.fn() };

    jest.doMock(withTxPath, () => ({
      withTransaction: jest.fn(async (fn) => fn(connMock)),
    }));
    jest.doMock(plansRepoPath, () => ({
      findBySlug: jest.fn(),
      findById: jest.fn(),
      listAll: jest.fn(),
      listPublic: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    }));
    jest.doMock(subsRepoPath, () => ({
      getCurrentForCorretora: jest.fn(),
      listForCorretora: jest.fn(),
      create: jest.fn(),
      cancelActiveForCorretora: jest.fn(),
      updateStatus: jest.fn(),
      applyCapabilitiesSnapshotToActiveByPlan: jest.fn(),
    }));

    plansRepo = require(plansRepoPath);
    subsRepo = require(subsRepoPath);
    svc = require("../../../services/planService");
  });

  describe("getPlanContext()", () => {
    it("retorna free default quando não há subscription ativa", async () => {
      subsRepo.getCurrentForCorretora.mockResolvedValue(null);
      plansRepo.findBySlug.mockResolvedValue(null);

      const ctx = await svc.getPlanContext(1);

      expect(ctx.status).toBe("free_default");
      expect(ctx.capabilities.max_users).toBe(1);
      expect(ctx.capabilities.leads_export).toBe(false);
    });

    it("resolve capabilities quando há subscription", async () => {
      subsRepo.getCurrentForCorretora.mockResolvedValue({
        id: 7,
        status: "active",
        current_period_end: new Date(),
        plan_slug: "pro",
        plan_name: "Pro",
        plan_price_cents: 14900,
        plan_capabilities: { max_users: 5, leads_export: true },
      });

      const ctx = await svc.getPlanContext(1);

      expect(ctx.status).toBe("active");
      expect(ctx.plan.slug).toBe("pro");
      expect(ctx.capabilities.max_users).toBe(5);
      expect(ctx.capabilities.leads_export).toBe(true);
      // Fallback preserva flags não setadas
      expect(ctx.capabilities.advanced_reports).toBe(false);
    });
  });

  describe("hasCapability()", () => {
    it("retorna false quando flag é falsa", async () => {
      subsRepo.getCurrentForCorretora.mockResolvedValue(null);
      plansRepo.findBySlug.mockResolvedValue(null);
      expect(await svc.hasCapability(1, "leads_export")).toBe(false);
    });

    it("aceita limite numérico (max_users)", async () => {
      subsRepo.getCurrentForCorretora.mockResolvedValue({
        plan_slug: "pro",
        plan_name: "Pro",
        plan_price_cents: 14900,
        status: "active",
        plan_capabilities: { max_users: 3 },
      });
      expect(await svc.hasCapability(1, "max_users", 3)).toBe(true);
      expect(await svc.hasCapability(1, "max_users", 4)).toBe(false);
    });
  });

  describe("assignPlan()", () => {
    it("400 se plano inativo", async () => {
      plansRepo.findById.mockResolvedValue({ id: 2, is_active: false });
      await expect(
        svc.assignPlan({ corretoraId: 1, planId: 2 }),
      ).rejects.toMatchObject({ status: 400 });
      expect(subsRepo.cancelActiveForCorretora).not.toHaveBeenCalled();
    });

    it("cancela anterior e cria nova dentro da transação", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 2,
        is_active: true,
        billing_cycle: "monthly",
      });
      subsRepo.cancelActiveForCorretora.mockResolvedValue(undefined);
      subsRepo.create.mockResolvedValue(987);
      subsRepo.getCurrentForCorretora.mockResolvedValue({
        id: 987,
        status: "active",
      });

      const result = await svc.assignPlan({ corretoraId: 11, planId: 2 });

      expect(result.id).toBe(987);
      expect(subsRepo.cancelActiveForCorretora).toHaveBeenCalledWith(
        11,
        connMock,
      );
      expect(subsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ corretora_id: 11, plan_id: 2 }),
        connMock,
      );
    });

    it("calcula current_period_end com ciclo anual", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 3,
        is_active: true,
        billing_cycle: "yearly",
      });
      subsRepo.cancelActiveForCorretora.mockResolvedValue(undefined);
      subsRepo.create.mockResolvedValue(1);
      subsRepo.getCurrentForCorretora.mockResolvedValue({});

      await svc.assignPlan({ corretoraId: 1, planId: 3 });

      const arg = subsRepo.create.mock.calls[0][0];
      const diffDays =
        (arg.current_period_end - arg.current_period_start) /
        (1000 * 60 * 60 * 24);
      // Janela anual ≈ 365 dias (aceita variação de leap year)
      expect(diffDays).toBeGreaterThan(360);
      expect(diffDays).toBeLessThan(370);
    });

    // Fase 5.4 — assignPlan agora congela capabilities no momento
    // da criação. Mudanças posteriores no catálogo não afetam esta
    // assinatura até broadcast explícito.
    it("grava capabilities_snapshot com as capabilities do plano", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 4,
        slug: "pro",
        name: "Pro",
        is_active: true,
        billing_cycle: "monthly",
        price_cents: 14900,
        capabilities: {
          max_users: 5,
          leads_export: true,
          regional_highlight: true,
          advanced_reports: false,
        },
      });
      subsRepo.cancelActiveForCorretora.mockResolvedValue(undefined);
      subsRepo.create.mockResolvedValue(500);
      subsRepo.getCurrentForCorretora.mockResolvedValue({});

      await svc.assignPlan({ corretoraId: 10, planId: 4 });

      const payload = subsRepo.create.mock.calls[0][0];
      expect(payload.capabilities_snapshot).toEqual({
        max_users: 5,
        leads_export: true,
        regional_highlight: true,
        advanced_reports: false,
      });
    });

    it("snapshot aceita capabilities em formato string (JSON serializado pelo driver)", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 5,
        slug: "pro",
        name: "Pro",
        is_active: true,
        billing_cycle: "monthly",
        price_cents: 14900,
        capabilities: '{"max_users":3,"leads_export":false}',
      });
      subsRepo.cancelActiveForCorretora.mockResolvedValue(undefined);
      subsRepo.create.mockResolvedValue(600);
      subsRepo.getCurrentForCorretora.mockResolvedValue({});

      await svc.assignPlan({ corretoraId: 11, planId: 5 });

      const payload = subsRepo.create.mock.calls[0][0];
      expect(payload.capabilities_snapshot).toEqual({
        max_users: 3,
        leads_export: false,
      });
    });
  });

  describe("broadcastCapabilitiesFromPlan()", () => {
    it("404 se plano não existe", async () => {
      plansRepo.findById.mockResolvedValue(null);
      await expect(svc.broadcastCapabilitiesFromPlan(999)).rejects.toMatchObject({
        status: 404,
      });
      expect(subsRepo.applyCapabilitiesSnapshotToActiveByPlan).not.toHaveBeenCalled();
    });

    it("aplica capabilities atuais às assinaturas ativas e retorna contagem", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 7,
        slug: "pro",
        name: "Pro",
        price_cents: 14900,
        billing_cycle: "monthly",
        capabilities: { max_users: 10, leads_export: true },
      });
      subsRepo.applyCapabilitiesSnapshotToActiveByPlan.mockResolvedValue(
        12,
      );

      const result = await svc.broadcastCapabilitiesFromPlan(7);

      expect(result).toEqual({
        affected: 12,
        capabilities: { max_users: 10, leads_export: true },
      });
      expect(
        subsRepo.applyCapabilitiesSnapshotToActiveByPlan,
      ).toHaveBeenCalledWith(7, { max_users: 10, leads_export: true });
    });

    it("broadcast com 0 assinaturas afetadas ainda retorna 0 (idempotente)", async () => {
      plansRepo.findById.mockResolvedValue({
        id: 8,
        slug: "free",
        name: "Free",
        capabilities: { max_users: 1 },
      });
      subsRepo.applyCapabilitiesSnapshotToActiveByPlan.mockResolvedValue(0);

      const result = await svc.broadcastCapabilitiesFromPlan(8);
      expect(result.affected).toBe(0);
    });
  });
});
