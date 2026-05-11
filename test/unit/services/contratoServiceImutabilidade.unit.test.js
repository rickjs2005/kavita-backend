// test/unit/services/contratoServiceImutabilidade.unit.test.js
//
// Cobre a regra "contrato signed é imutável" (Fase 10.4):
//   - draft pode ser cancelado
//   - sent → signed (caminho do webhook ClickSign) funciona
//   - signed: cancelar/enviar/simular bloqueados com 409 e mensagem
//     "Contrato assinado não pode ser alterado."
//   - findByToken (verificação pública) e listByLead continuam OK
//
// Mocks isolam Puppeteer/Handlebars/banco — o foco é a regra de
// negócio nos guards do service e no repository updateStatus.
"use strict";

describe("contratoService — imutabilidade pós-assinatura", () => {
  function buildContrato(overrides = {}) {
    return {
      id: 42,
      lead_id: 10,
      corretora_id: 1,
      tipo: "disponivel",
      status: "draft",
      pdf_url: "storage/contratos/1/abc.pdf",
      hash_sha256: "a".repeat(64),
      qr_verification_token: "tok-1",
      data_fields: {},
      sent_at: null,
      signed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      ...overrides,
    };
  }

  function loadServiceWithMocks(mocks = {}) {
    jest.resetModules();
    // O service congela CONTRATO_SIGNER_PROVIDER no module load
    // (default 'stub'). O .env local pode setar 'clicksign' — força
    // 'stub' aqui para o caminho do simularAssinatura ser testável
    // independente da configuração da máquina que roda os testes.
    process.env.CONTRATO_SIGNER_PROVIDER = "stub";

    const contratoRepo = mocks.contratoRepo ?? {
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
      hasActiveForLead: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue(1234),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findByToken: jest.fn(),
      listByLead: jest.fn().mockResolvedValue([]),
    };
    const leadEventsRepo = mocks.leadEventsRepo ?? {
      create: jest.fn().mockResolvedValue(1),
    };
    const leadsRepo = mocks.leadsRepo ?? {
      findByIdForCorretora: jest.fn(),
    };
    const corretorasRepo = mocks.corretorasRepo ?? {
      findById: jest.fn(),
    };
    const planService = mocks.planService ?? {
      requireActivePlanWithCapability: jest.fn().mockResolvedValue({}),
    };

    jest.doMock(
      require.resolve("../../../repositories/contratoRepository"),
      () => contratoRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadEventsRepository"),
      () => leadEventsRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadsRepository"),
      () => leadsRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/corretorasPublicRepository"),
      () => corretorasRepo,
    );
    jest.doMock(
      require.resolve("../../../services/planService"),
      () => planService,
    );
    // Fase 10.5 — audit log foi plugado nos paths de cancelar/enviar/
    // simular/created/blocked. Mocamos como no-op para isolar a
    // regra de imutabilidade do banco de audit.
    jest.doMock(
      require.resolve("../../../services/contractAuditLogService"),
      () => ({
        record: jest.fn().mockResolvedValue(undefined),
        fromRequest: () => ({}),
      }),
    );

    // eslint-disable-next-line global-require
    const service = require("../../../services/contratoService");
    return { service, contratoRepo, leadEventsRepo };
  }

  // ─── Cancelar ──────────────────────────────────────────────────────────────

  it("permite cancelar contrato em status 'draft'", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      contratoRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildContrato({ status: "draft" })),
        updateStatus: jest.fn().mockResolvedValue(undefined),
      },
    });
    const result = await service.cancelar({
      id: 42,
      corretoraId: 1,
      motivo: "ajuste no preço",
      actor: { userId: 7 },
    });
    expect(result).toEqual({ id: 42, status: "cancelled" });
    expect(contratoRepo.updateStatus).toHaveBeenCalledWith(
      42,
      "cancelled",
      expect.objectContaining({ cancel_reason: "ajuste no preço" }),
    );
  });

  it("bloqueia cancelar contrato em status 'signed' com 409 'não pode ser alterado'", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      contratoRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildContrato({ status: "signed" })),
        updateStatus: jest.fn(),
      },
    });
    await expect(
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "tentativa indevida",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
      details: { current_status: "signed" },
    });
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ─── Enviar para assinatura ────────────────────────────────────────────────

  it("bloqueia enviar contrato 'signed' com mensagem específica", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      contratoRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildContrato({ status: "signed" })),
        updateStatus: jest.fn(),
      },
    });
    await expect(
      service.enviarParaAssinatura({ id: 42, corretoraId: 1 }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
    });
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ─── Simular assinatura (admin stub) ──────────────────────────────────────

  it("bloqueia simular assinatura quando contrato já está 'signed'", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      contratoRepo: {
        findByIdUnscoped: jest
          .fn()
          .mockResolvedValue(buildContrato({ status: "signed" })),
        updateStatus: jest.fn(),
      },
    });
    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 1 } }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
    });
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ─── Leitura segue funcionando ────────────────────────────────────────────

  it("findByToken (verificação pública) continua OK em contrato signed", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      contratoRepo: {
        findByToken: jest.fn().mockResolvedValue({
          id: 42,
          tipo: "disponivel",
          status: "signed",
          hash_sha256: "a".repeat(64),
          qr_verification_token: "tok-1",
          signed_at: new Date("2026-04-20"),
          created_at: new Date("2026-04-19"),
          corretora_name: "Corretora X",
          corretora_slug: "corretora-x",
          data_fields: {
            safra: "2025/2026",
            quantidade_sacas: 200,
            __partes_produtor_nome: "João Silva",
          },
        }),
      },
    });
    const result = await service.getByVerificationToken("tok-1");
    expect(result).toMatchObject({
      tipo: "disponivel",
      status: "signed",
      hash_sha256: "a".repeat(64),
      corretora: { name: "Corretora X" },
      resumo: {
        safra: "2025/2026",
        quantidade_sacas: 200,
        produtor_iniciais: "J. Silva",
      },
    });
    // Sanidade: dados sensíveis seguem fora.
    expect(JSON.stringify(result)).not.toContain("João Silva");
    expect(contratoRepo.findByToken).toHaveBeenCalledWith("tok-1");
  });

  it("listByLead retorna contratos incluindo os signed", async () => {
    const { service, contratoRepo } = loadServiceWithMocks({
      leadsRepo: {
        findByIdForCorretora: jest
          .fn()
          .mockResolvedValue({ id: 10, corretora_id: 1, status: "closed" }),
      },
      contratoRepo: {
        listByLead: jest.fn().mockResolvedValue([
          { id: 41, status: "signed" },
          { id: 42, status: "draft" },
        ]),
      },
    });
    const list = await service.listByLead({ leadId: 10, corretoraId: 1 });
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.status)).toEqual(["signed", "draft"]);
    expect(contratoRepo.listByLead).toHaveBeenCalledWith(10, 1);
  });
});

// Os testes do repository (guard SQL real) ficam em
// test/unit/repositories/contratoRepositoryGuard.unit.test.js — separado
// para não compartilhar o estado de jest.doMock dos testes do service
// acima, que mocam o próprio contratoRepository.
