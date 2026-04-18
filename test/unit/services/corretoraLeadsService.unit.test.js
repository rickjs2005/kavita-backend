/**
 * test/unit/services/corretoraLeadsService.unit.test.js
 *
 * Cobre pontos críticos das Fases 2 e 3:
 *   - Dedupe 24h em createLeadFromPublic
 *   - Escopo por corretora_id em getLeadDetail
 *   - addLeadNote + emissão de evento na timeline
 *   - deleteLeadNote 404 quando não pertence à corretora
 */

describe("services/corretoraLeadsService", () => {
  const leadsRepoPath = require.resolve(
    "../../../repositories/corretoraLeadsRepository",
  );
  const notesRepoPath = require.resolve(
    "../../../repositories/corretoraLeadNotesRepository",
  );
  const eventsRepoPath = require.resolve(
    "../../../repositories/corretoraLeadEventsRepository",
  );
  const publicRepoPath = require.resolve(
    "../../../repositories/corretorasPublicRepository",
  );
  const notificationsRepoPath = require.resolve(
    "../../../repositories/corretoraNotificationsRepository",
  );
  const usersRepoPath = require.resolve(
    "../../../repositories/corretoraUsersRepository",
  );
  const mailPath = require.resolve("../../../services/mailService");
  const analyticsPath = require.resolve(
    "../../../services/analyticsService",
  );

  let svc;
  let leadsRepo;
  let notesRepo;
  let eventsRepo;
  let publicRepo;
  let notificationsRepo;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(leadsRepoPath, () => ({
      create: jest.fn().mockResolvedValue(1001),
      findByIdForCorretora: jest.fn(),
      findByIdRaw: jest.fn(),
      findRecentByCorretoraAndPhone: jest.fn(),
      markRecontactAttempt: jest.fn().mockResolvedValue(1),
      countPreviousFromSameProducer: jest.fn().mockResolvedValue(0),
      list: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
      markFirstResponse: jest.fn().mockResolvedValue(1),
      broadcastLoteVendido: jest.fn().mockResolvedValue([]),
      summary: jest.fn(),
      listOverdueNextActions: jest.fn().mockResolvedValue([]),
      listStaleNewLeads: jest.fn().mockResolvedValue([]),
      getPipelineValue: jest.fn().mockResolvedValue({
        negotiating: { total: 0, soma_propostos: 0 },
        closed_month: { total: 0, soma_fechados: 0 },
      }),
      getClosedLotsAggregate: jest.fn(),
    }));

    jest.doMock(notesRepoPath, () => ({
      listForLead: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(55),
      deleteById: jest.fn().mockResolvedValue(1),
    }));

    jest.doMock(eventsRepoPath, () => ({
      listForLead: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(77),
    }));

    jest.doMock(publicRepoPath, () => ({
      findBySlug: jest.fn(),
      findById: jest.fn(),
    }));

    jest.doMock(notificationsRepoPath, () => ({
      create: jest.fn().mockResolvedValue(1),
    }));

    jest.doMock(usersRepoPath, () => ({
      listTeamByCorretoraId: jest.fn().mockResolvedValue([]),
    }));

    jest.doMock(mailPath, () => ({
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
      sendLeadProducerConfirmationEmail: jest
        .fn()
        .mockResolvedValue(undefined),
    }));

    jest.doMock(analyticsPath, () => ({
      track: jest.fn(),
    }));

    leadsRepo = require(leadsRepoPath);
    notesRepo = require(notesRepoPath);
    eventsRepo = require(eventsRepoPath);
    publicRepo = require(publicRepoPath);
    notificationsRepo = require(notificationsRepoPath);
    svc = require("../../../services/corretoraLeadsService");

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  // -------------------------------------------------------------------------
  // Dedupe 24h — Fase 2.2
  // -------------------------------------------------------------------------
  describe("createLeadFromPublic() — dedupe", () => {
    const baseCorretora = {
      id: 10,
      slug: "cafe-manhuacu",
      status: "active",
      name: "Café Manhuaçu",
    };
    const baseData = {
      nome: "João Produtor",
      telefone: "(33) 9 9999-0000",
      cidade: "Manhuaçu",
      consentimento_contato: true,
    };

    it("cria lead novo quando não há contato recente do mesmo produtor", async () => {
      publicRepo.findBySlug.mockResolvedValue(baseCorretora);
      leadsRepo.findRecentByCorretoraAndPhone.mockResolvedValue(null);

      const result = await svc.createLeadFromPublic({
        slug: "cafe-manhuacu",
        data: baseData,
        meta: { ip: "127.0.0.1" },
      });

      expect(result).toMatchObject({
        id: 1001,
        corretora_id: 10,
      });
      expect(result.deduplicated).toBeFalsy();
      expect(leadsRepo.create).toHaveBeenCalled();
      expect(leadsRepo.markRecontactAttempt).not.toHaveBeenCalled();
    });

    it("reaproveita lead existente quando produtor contactou em < 24h", async () => {
      publicRepo.findBySlug.mockResolvedValue(baseCorretora);
      const existingLead = {
        id: 500,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h atrás
        status: "new",
        first_response_at: null,
      };
      leadsRepo.findRecentByCorretoraAndPhone.mockResolvedValue(existingLead);

      const result = await svc.createLeadFromPublic({
        slug: "cafe-manhuacu",
        data: baseData,
        meta: {},
      });

      expect(result).toEqual({
        id: 500,
        corretora_id: 10,
        deduplicated: true,
      });
      expect(leadsRepo.create).not.toHaveBeenCalled();
      expect(leadsRepo.markRecontactAttempt).toHaveBeenCalledWith(500);
      // Notifica a corretora que o produtor voltou
      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          corretora_id: 10,
          type: "lead.recontato",
        }),
      );
    });

    it("404 quando corretora não existe", async () => {
      publicRepo.findBySlug.mockResolvedValue(null);
      await expect(
        svc.createLeadFromPublic({
          slug: "nope",
          data: baseData,
          meta: {},
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("409 quando corretora está inativa", async () => {
      publicRepo.findBySlug.mockResolvedValue({
        ...baseCorretora,
        status: "inactive",
      });
      await expect(
        svc.createLeadFromPublic({
          slug: "cafe-manhuacu",
          data: baseData,
          meta: {},
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("emite evento lead_created na timeline em novo lead", async () => {
      publicRepo.findBySlug.mockResolvedValue(baseCorretora);
      leadsRepo.findRecentByCorretoraAndPhone.mockResolvedValue(null);

      await svc.createLeadFromPublic({
        slug: "cafe-manhuacu",
        data: baseData,
        meta: {},
      });

      expect(eventsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: 1001,
          corretora_id: 10,
          event_type: "lead_created",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getLeadDetail — Fase 3 tenant-scope
  // -------------------------------------------------------------------------
  describe("getLeadDetail()", () => {
    it("404 quando lead não pertence à corretora autenticada", async () => {
      leadsRepo.findByIdForCorretora.mockResolvedValue(null);
      await expect(svc.getLeadDetail(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("retorna lead + notes + events com escopo correto", async () => {
      leadsRepo.findByIdForCorretora.mockResolvedValue({
        id: 42,
        corretora_id: 10,
        nome: "Ana",
        telefone_normalizado: "55339999",
        status: "new",
        volume_range: "200_500",
      });
      notesRepo.listForLead.mockResolvedValue([
        { id: 1, body: "Amostra pedida" },
      ]);
      eventsRepo.listForLead.mockResolvedValue([
        { id: 99, event_type: "lead_created" },
      ]);
      leadsRepo.countPreviousFromSameProducer.mockResolvedValue(2);

      const res = await svc.getLeadDetail(42, 10);

      // Confirma escopo — passou corretoraId=10 pra todas as queries
      expect(leadsRepo.findByIdForCorretora).toHaveBeenCalledWith(42, 10);
      expect(notesRepo.listForLead).toHaveBeenCalledWith({
        leadId: 42,
        corretoraId: 10,
      });
      expect(eventsRepo.listForLead).toHaveBeenCalledWith({
        leadId: 42,
        corretoraId: 10,
      });
      expect(res.lead.id).toBe(42);
      expect(res.lead.previous_contacts_count).toBe(2);
      expect(res.lead.priority_score).toBeGreaterThan(0);
      expect(res.notes).toHaveLength(1);
      expect(res.events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // addLeadNote / deleteLeadNote
  // -------------------------------------------------------------------------
  describe("addLeadNote()", () => {
    it("404 quando lead não pertence à corretora", async () => {
      leadsRepo.findByIdForCorretora.mockResolvedValue(null);
      await expect(
        svc.addLeadNote({
          leadId: 1,
          corretoraId: 99,
          actor: { userId: 5 },
          body: "oi",
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("cria nota + emite evento note_added na timeline", async () => {
      leadsRepo.findByIdForCorretora.mockResolvedValue({
        id: 42,
        corretora_id: 10,
      });

      const res = await svc.addLeadNote({
        leadId: 42,
        corretoraId: 10,
        actor: { userId: 7 },
        body: "Produtor pediu ligação às 17h",
      });

      expect(res).toEqual({ id: 55 });
      expect(notesRepo.create).toHaveBeenCalledWith({
        lead_id: 42,
        corretora_id: 10,
        author_user_id: 7,
        body: "Produtor pediu ligação às 17h",
      });
      expect(eventsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: 42,
          event_type: "note_added",
          actor_user_id: 7,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // FIX #6 — preco_fechado auto-seta status=closed
  // -------------------------------------------------------------------------
  describe("updateLeadProposal() — auto-close", () => {
    it("preco_fechado pela 1ª vez fecha o deal automaticamente", async () => {
      leadsRepo.findByIdForCorretora
        .mockResolvedValueOnce({
          id: 42,
          corretora_id: 10,
          status: "contacted",
          preco_fechado: null,
          created_at: new Date(),
          first_response_at: new Date(),
        })
        .mockResolvedValueOnce({ id: 42, status: "closed" });

      await svc.updateLeadProposal({
        leadId: 42,
        corretoraId: 10,
        actor: { userId: 7 },
        data: { preco_fechado: 1815 },
      });

      // O patch enviado ao repo.update deve incluir status: "closed"
      expect(leadsRepo.update).toHaveBeenCalledWith(
        42,
        10,
        expect.objectContaining({
          preco_fechado: 1815,
          status: "closed",
        }),
      );
    });

    it("NÃO auto-fecha se status já é lost (preserva manual)", async () => {
      leadsRepo.findByIdForCorretora
        .mockResolvedValueOnce({
          id: 42,
          corretora_id: 10,
          status: "lost",
          preco_fechado: null,
          created_at: new Date(),
          first_response_at: new Date(),
        })
        .mockResolvedValueOnce({ id: 42, status: "lost" });

      await svc.updateLeadProposal({
        leadId: 42,
        corretoraId: 10,
        actor: { userId: 7 },
        data: { preco_fechado: 1815 },
      });

      const patch = leadsRepo.update.mock.calls[0][2];
      expect(patch.status).toBeUndefined();
    });

    it("NÃO auto-fecha quando preco_fechado já existia (atualização)", async () => {
      leadsRepo.findByIdForCorretora
        .mockResolvedValueOnce({
          id: 42,
          corretora_id: 10,
          status: "contacted",
          preco_fechado: 1800, // já tinha valor
          created_at: new Date(),
          first_response_at: new Date(),
        })
        .mockResolvedValueOnce({ id: 42, status: "contacted" });

      await svc.updateLeadProposal({
        leadId: 42,
        corretoraId: 10,
        actor: { userId: 7 },
        data: { preco_fechado: 1820 }, // ajuste
      });

      const patch = leadsRepo.update.mock.calls[0][2];
      expect(patch.status).toBeUndefined();
    });

    it("auto-close desde 'new' grava first_response_at (SLA)", async () => {
      leadsRepo.findByIdForCorretora
        .mockResolvedValueOnce({
          id: 42,
          corretora_id: 10,
          status: "new",
          preco_fechado: null,
          created_at: new Date(Date.now() - 3600 * 1000), // 1h atrás
          first_response_at: null,
        })
        .mockResolvedValueOnce({ id: 42, status: "closed" });

      await svc.updateLeadProposal({
        leadId: 42,
        corretoraId: 10,
        actor: { userId: 7 },
        data: { preco_fechado: 1815 },
      });

      expect(leadsRepo.markFirstResponse).toHaveBeenCalledWith(
        42,
        10,
        expect.any(Number),
      );
    });
  });

  describe("deleteLeadNote()", () => {
    it("404 quando nota não existe no escopo (corretora, lead)", async () => {
      notesRepo.deleteById.mockResolvedValue(0);
      await expect(
        svc.deleteLeadNote({ leadId: 1, corretoraId: 99, noteId: 7 }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("propaga escopo pra query de remoção", async () => {
      notesRepo.deleteById.mockResolvedValue(1);
      await svc.deleteLeadNote({ leadId: 42, corretoraId: 10, noteId: 7 });
      expect(notesRepo.deleteById).toHaveBeenCalledWith({
        id: 7,
        lead_id: 42,
        corretora_id: 10,
      });
    });
  });
});
