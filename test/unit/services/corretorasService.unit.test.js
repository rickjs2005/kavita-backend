/**
 * test/unit/services/corretorasService.unit.test.js
 *
 * Cobre os fluxos críticos do módulo Mercado do Café:
 *   - approveSubmission (transacional)
 *   - rejectSubmission (transacional)
 *
 * Padrão: mock do pool + mocks dos repos/services usados.
 */

describe("services/corretorasService", () => {
  const poolPath = require.resolve("../../../config/pool");
  const withTxPath = require.resolve("../../../lib/withTransaction");
  const adminRepoPath = require.resolve(
    "../../../repositories/corretorasAdminRepository",
  );
  const usersRepoPath = require.resolve(
    "../../../repositories/corretoraUsersRepository",
  );
  const mailPath = require.resolve("../../../services/mailService");
  const plansRepoPath = require.resolve(
    "../../../repositories/plansRepository",
  );
  const subsRepoPath = require.resolve(
    "../../../repositories/subscriptionsRepository",
  );
  const subEventsRepoPath = require.resolve(
    "../../../repositories/subscriptionEventsRepository",
  );
  const slugHistoryRepoPath = require.resolve(
    "../../../repositories/corretoraSlugHistoryRepository",
  );
  const planServicePath = require.resolve("../../../services/planService");

  let svc;
  let adminRepo;
  let usersRepo;
  let mail;
  let planService;
  let connMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    connMock = { query: jest.fn(), execute: jest.fn() };

    // Mock do withTransaction — chama o callback com a conexão fake
    jest.doMock(withTxPath, () => ({
      withTransaction: jest.fn(async (fn) => fn(connMock)),
    }));

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
      getConnection: jest.fn(),
    }));

    jest.doMock(adminRepoPath, () => ({
      findSubmissionById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      approveSubmission: jest.fn(),
      rejectSubmission: jest.fn(),
      clearSubmissionPassword: jest.fn(),
      findPendingSubmissionByEmail: jest.fn(),
      findById: jest.fn(),
    }));

    jest.doMock(usersRepoPath, () => ({
      findByEmail: jest.fn(),
      findByCorretoraId: jest.fn(),
      create: jest.fn(),
      createPending: jest.fn(),
      updateContactFields: jest.fn(),
      countByCorretoraId: jest.fn(),
    }));

    jest.doMock(mailPath, () => ({
      sendCorretoraApprovedEmail: jest.fn().mockResolvedValue(undefined),
      sendCorretoraInviteEmail: jest.fn().mockResolvedValue(undefined),
      sendCorretoraRejectionEmail: jest.fn().mockResolvedValue(undefined),
    }));

    // Auto-trial na aprovação (commit 5f8e4e0) — sem esses mocks os
    // testes de approveSubmission quebram ao tentar ler planos no pool.
    jest.doMock(plansRepoPath, () => ({
      findBySlug: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock(subsRepoPath, () => ({
      create: jest.fn().mockResolvedValue(undefined),
      getCurrentForCorretora: jest.fn(),
    }));
    jest.doMock(subEventsRepoPath, () => ({
      create: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock(slugHistoryRepoPath, () => ({
      record: jest.fn().mockResolvedValue(undefined),
      resolveRedirect: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock(planServicePath, () => ({
      hasCapability: jest.fn().mockResolvedValue(true),
      getPlanContext: jest.fn().mockResolvedValue({
        plan: { slug: "pro", name: "Pro" },
      }),
      // Re-export minimal — corretorasService não usa mais nada
      assignPlan: jest.fn(),
      requirePlanCapability: jest.fn(),
    }));

    adminRepo = require(adminRepoPath);
    usersRepo = require(usersRepoPath);
    mail = require(mailPath);
    planService = require(planServicePath);
    svc = require("../../../services/corretorasService");

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.error.mockRestore?.();
  });

  // -------------------------------------------------------------------------
  // approveSubmission
  // -------------------------------------------------------------------------

  describe("approveSubmission()", () => {
    const baseSub = {
      id: 42,
      status: "pending",
      name: "Café do João",
      contact_name: "João",
      email: "joao@example.com",
      city: "Manhuaçu",
      state: "MG",
      password_hash: null,
    };

    it("404 quando submissão não existe", async () => {
      adminRepo.findSubmissionById.mockResolvedValue(null);
      await expect(svc.approveSubmission(999, 1)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("é idempotente se já foi aprovada", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        ...baseSub,
        status: "approved",
        corretora_id: 77,
      });
      const res = await svc.approveSubmission(42, 1);
      expect(res).toEqual({ corretora_id: 77, already_approved: true });
      expect(adminRepo.create).not.toHaveBeenCalled();
    });

    it("bloqueia aprovação de submissão rejeitada (409)", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        ...baseSub,
        status: "rejected",
      });
      await expect(svc.approveSubmission(42, 1)).rejects.toMatchObject({
        status: 409,
      });
    });

    it("cria corretora, marca submissão como aprovada (sem senha → sem user)", async () => {
      // 1ª chamada: pre-check fora do tx. 2ª: dentro do tx.
      adminRepo.findSubmissionById
        .mockResolvedValueOnce(baseSub)
        .mockResolvedValueOnce(baseSub);
      adminRepo.findBySlug.mockResolvedValue(null); // slug livre
      adminRepo.create.mockResolvedValue(101);
      adminRepo.approveSubmission.mockResolvedValue(1);

      const res = await svc.approveSubmission(42, 9);

      expect(res).toEqual({ corretora_id: 101, auto_user_created: false });
      expect(adminRepo.create).toHaveBeenCalledTimes(1);
      expect(adminRepo.approveSubmission).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ reviewed_by: 9, corretora_id: 101 }),
        connMock,
      );
      // Sem senha → sem criação de user + sem envio de email
      expect(usersRepo.create).not.toHaveBeenCalled();
      expect(mail.sendCorretoraApprovedEmail).not.toHaveBeenCalled();
    });

    it("cria user e envia email quando submissão traz password_hash", async () => {
      const subWithPwd = { ...baseSub, password_hash: "hash123" };
      adminRepo.findSubmissionById
        .mockResolvedValueOnce(subWithPwd)
        .mockResolvedValueOnce(subWithPwd);
      adminRepo.findBySlug.mockResolvedValue(null);
      adminRepo.create.mockResolvedValue(101);
      adminRepo.approveSubmission.mockResolvedValue(1);
      usersRepo.findByEmail.mockResolvedValue(null);
      usersRepo.create.mockResolvedValue(555);

      const res = await svc.approveSubmission(42, 9);

      expect(res).toEqual({ corretora_id: 101, auto_user_created: true });
      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          corretora_id: 101,
          email: "joao@example.com",
          password_hash: "hash123",
        }),
        connMock,
      );
      expect(mail.sendCorretoraApprovedEmail).toHaveBeenCalledWith(
        "joao@example.com",
        "Café do João",
      );
    });

    it("se email já tomado na aprovação, corretora é criada mas user não", async () => {
      const subWithPwd = { ...baseSub, password_hash: "hash123" };
      adminRepo.findSubmissionById
        .mockResolvedValueOnce(subWithPwd)
        .mockResolvedValueOnce(subWithPwd);
      adminRepo.findBySlug.mockResolvedValue(null);
      adminRepo.create.mockResolvedValue(101);
      adminRepo.approveSubmission.mockResolvedValue(1);
      usersRepo.findByEmail.mockResolvedValue({ id: 999 }); // e-mail já tomado

      const res = await svc.approveSubmission(42, 9);

      expect(res).toEqual({ corretora_id: 101, auto_user_created: false });
      expect(usersRepo.create).not.toHaveBeenCalled();
      expect(mail.sendCorretoraApprovedEmail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // rejectSubmission
  // -------------------------------------------------------------------------

  describe("rejectSubmission()", () => {
    it("404 quando submissão não existe", async () => {
      adminRepo.findSubmissionById.mockResolvedValue(null);
      await expect(svc.rejectSubmission(1, 2, "motivo")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("409 se não estiver pending", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        id: 1,
        status: "approved",
      });
      await expect(svc.rejectSubmission(1, 2, "motivo")).rejects.toMatchObject({
        status: 409,
      });
    });

    it("rejeita + limpa password_hash dentro da transação", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        id: 1,
        status: "pending",
      });
      adminRepo.rejectSubmission.mockResolvedValue(1);
      adminRepo.clearSubmissionPassword.mockResolvedValue(undefined);

      await svc.rejectSubmission(1, 2, "motivo");

      expect(adminRepo.rejectSubmission).toHaveBeenCalledWith(
        1,
        { reviewed_by: 2, rejection_reason: "motivo" },
        connMock,
      );
      expect(adminRepo.clearSubmissionPassword).toHaveBeenCalledWith(
        1,
        connMock,
      );
      // Sem email na submissão → não tenta enviar e-mail editorial.
      expect(mail.sendCorretoraRejectionEmail).not.toHaveBeenCalled();
    });

    it("envia e-mail editorial de rejeição quando submissão tem email", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        id: 1,
        status: "pending",
        name: "Café do João",
        email: "joao@example.com",
      });
      adminRepo.rejectSubmission.mockResolvedValue(1);
      adminRepo.clearSubmissionPassword.mockResolvedValue(undefined);

      await svc.rejectSubmission(1, 2, "Faltou certificação INCRA.");

      expect(mail.sendCorretoraRejectionEmail).toHaveBeenCalledWith(
        "joao@example.com",
        "Café do João",
        "Faltou certificação INCRA.",
      );
    });

    it("não falha se envio de e-mail de rejeição lançar (fire-and-forget)", async () => {
      adminRepo.findSubmissionById.mockResolvedValue({
        id: 1,
        status: "pending",
        name: "Café do João",
        email: "joao@example.com",
      });
      adminRepo.rejectSubmission.mockResolvedValue(1);
      adminRepo.clearSubmissionPassword.mockResolvedValue(undefined);
      mail.sendCorretoraRejectionEmail.mockRejectedValueOnce(
        new Error("smtp down"),
      );

      await expect(
        svc.rejectSubmission(1, 2, "motivo"),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // toggleFeatured — Fase 1.3 (regional_highlight)
  // -------------------------------------------------------------------------
  describe("toggleFeatured()", () => {
    beforeEach(() => {
      adminRepo.updateFeatured = jest.fn().mockResolvedValue(1);
      adminRepo.countFeatured = jest.fn().mockResolvedValue(0);
    });

    it("404 quando corretora não existe", async () => {
      adminRepo.findById.mockResolvedValue(null);
      await expect(svc.toggleFeatured(999, true)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("bloqueia destacar corretora inativa (400)", async () => {
      adminRepo.findById.mockResolvedValue({
        id: 1,
        status: "inactive",
        is_featured: 0,
      });
      await expect(svc.toggleFeatured(1, true)).rejects.toMatchObject({
        status: 400,
      });
    });

    it("bloqueia destacar quando plano NÃO inclui regional_highlight", async () => {
      adminRepo.findById.mockResolvedValue({
        id: 1,
        status: "active",
        is_featured: 0,
      });
      planService.hasCapability.mockResolvedValueOnce(false);
      planService.getPlanContext.mockResolvedValueOnce({
        plan: { slug: "free", name: "Free" },
      });

      await expect(svc.toggleFeatured(1, true)).rejects.toMatchObject({
        status: 400,
      });
      // Capability é checada ANTES do cap global — countFeatured não
      // deve nem ser chamado quando plano reprova.
      expect(adminRepo.countFeatured).not.toHaveBeenCalled();
    });

    it("permite destacar quando plano tem regional_highlight e cap livre", async () => {
      adminRepo.findById.mockResolvedValue({
        id: 1,
        status: "active",
        is_featured: 0,
      });
      planService.hasCapability.mockResolvedValue(true);
      adminRepo.countFeatured.mockResolvedValue(2); // cap default 5

      await svc.toggleFeatured(1, true);
      expect(adminRepo.updateFeatured).toHaveBeenCalledWith(1, true);
    });

    it("bloqueia quando cap global está cheio (5 destaques)", async () => {
      adminRepo.findById.mockResolvedValue({
        id: 1,
        status: "active",
        is_featured: 0,
      });
      planService.hasCapability.mockResolvedValue(true);
      adminRepo.countFeatured.mockResolvedValue(5);

      await expect(svc.toggleFeatured(1, true)).rejects.toMatchObject({
        status: 409,
      });
    });

    it("desligar destaque nunca é bloqueado (idempotente)", async () => {
      adminRepo.findById.mockResolvedValue({
        id: 1,
        status: "active",
        is_featured: 1,
      });
      // Capability/cap NÃO são checados quando is_featured: false
      await svc.toggleFeatured(1, false);
      expect(planService.hasCapability).not.toHaveBeenCalled();
      expect(adminRepo.countFeatured).not.toHaveBeenCalled();
      expect(adminRepo.updateFeatured).toHaveBeenCalledWith(1, false);
    });
  });
});
