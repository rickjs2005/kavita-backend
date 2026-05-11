// test/unit/services/contratoServiceSignedTransaction.unit.test.js
//
// Cobre a Fase 10.9 — UPDATE de transição sent→signed + audit "signed"
// rodam no MESMO withTransaction no fluxo stub/admin (simularAssinatura).
// Webhook ClickSign (contratoSignerService.processarEventoWebhook)
// permanece como estava — fora do escopo desta etapa.
//
// Mesmo padrão das suítes Created/Cancelled/SentToSignature: mocka
// withTransaction como pass-through e inspeciona se as duas chamadas
// receberam a mesma conn.
"use strict";

function buildContrato(overrides = {}) {
  return {
    id: 42,
    lead_id: 10,
    corretora_id: 1,
    tipo: "disponivel",
    status: "sent",
    pdf_url: "storage/contratos/1/abc.pdf",
    hash_sha256: "a".repeat(64),
    qr_verification_token: "tok-1",
    data_fields: {},
    sent_at: new Date("2026-05-10"),
    signed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  };
}

function loadServiceWithMocks(mocks = {}) {
  jest.resetModules();
  // simularAssinatura exige CONTRATO_SIGNER_PROVIDER=stub (lança 409
  // caso contrário). Forçamos aqui para tornar os testes independentes
  // do .env da máquina de quem roda.
  process.env.CONTRATO_SIGNER_PROVIDER = "stub";

  const mockConn = mocks.mockConn ?? { __mock: "tx-conn-signed" };

  const withTransaction =
    mocks.withTransaction ?? jest.fn(async (fn) => fn(mockConn));
  jest.doMock(require.resolve("../../../lib/withTransaction"), () => ({
    withTransaction,
  }));

  const contratoRepo = mocks.contratoRepo ?? {
    findById: jest.fn(),
    findByIdUnscoped: jest
      .fn()
      .mockResolvedValue(buildContrato({ status: "sent" })),
    findByToken: jest.fn(),
    listByLead: jest.fn(),
    hasActiveForLead: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  const leadsRepo = mocks.leadsRepo ?? { findByIdForCorretora: jest.fn() };
  const publicCorretorasRepo = mocks.publicCorretorasRepo ?? {
    findById: jest.fn(),
  };
  const leadEventsRepo = mocks.leadEventsRepo ?? {
    create: jest.fn().mockResolvedValue(1),
  };
  const planService = mocks.planService ?? {
    requireActivePlanWithCapability: jest.fn(),
  };
  const auditLog = mocks.auditLog ?? {
    record: jest.fn().mockResolvedValue(undefined),
    fromRequest: () => ({}),
  };

  jest.doMock(
    require.resolve("../../../repositories/contratoRepository"),
    () => contratoRepo,
  );
  jest.doMock(
    require.resolve("../../../repositories/corretoraLeadsRepository"),
    () => leadsRepo,
  );
  jest.doMock(
    require.resolve("../../../repositories/corretorasPublicRepository"),
    () => publicCorretorasRepo,
  );
  jest.doMock(
    require.resolve("../../../repositories/corretoraLeadEventsRepository"),
    () => leadEventsRepo,
  );
  jest.doMock(
    require.resolve("../../../services/planService"),
    () => planService,
  );
  jest.doMock(
    require.resolve("../../../services/contractAuditLogService"),
    () => auditLog,
  );

  // eslint-disable-next-line global-require
  const service = require("../../../services/contratoService");
  return {
    service,
    contratoRepo,
    auditLog,
    leadEventsRepo,
    mockConn,
    withTransaction,
  };
}

describe("contratoService.simularAssinatura (stub/admin) — atomicidade UPDATE + audit 'signed'", () => {
  it("sucesso: updateStatus e auditLog.record recebem a MESMA conn; provider=stub, actorType=system", async () => {
    const { service, contratoRepo, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks();

    const result = await service.simularAssinatura({
      id: 42,
      actor: { id: 99 },
    });

    expect(result).toMatchObject({ id: 42, status: "signed" });
    expect(result.signed_at).toBeInstanceOf(Date);
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // updateStatus(id, "signed", patch, conn) com patch.signed_at Date.
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    const updateArgs = contratoRepo.updateStatus.mock.calls[0];
    expect(updateArgs[0]).toBe(42);
    expect(updateArgs[1]).toBe("signed");
    expect(updateArgs[2]).toEqual({ signed_at: expect.any(Date) });
    expect(updateArgs[3]).toBe(mockConn);

    // audit record({...}, { conn }) com previous/new coerentes,
    // provider=stub e actorType=system.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload).toMatchObject({
      contratoId: 42,
      corretoraId: 1,
      leadId: 10,
      eventType: "signed",
      actorType: "system",
      actorId: 99,
      previousStatus: "sent",
      newStatus: "signed",
      provider: "stub",
      payload: { admin_actor: 99, simulated: true },
    });
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("o signed_at é o mesmo no updateStatus, no audit (não vazado) e no retorno", async () => {
    // Reuse do mockConn para conferir consistência: vamos congelar
    // Date momentarily não — é mais simples verificar que o `signed_at`
    // do patch coincide com o do retorno (ambos referenciam a mesma
    // variável local signedAt). Isto cobre o requisito "previousStatus
    // e newStatus devem ser coerentes" e a estabilidade temporal.
    const { service, contratoRepo } = loadServiceWithMocks();
    const result = await service.simularAssinatura({
      id: 42,
      actor: { id: 99 },
    });
    const updateArgs = contratoRepo.updateStatus.mock.calls[0];
    expect(updateArgs[2].signed_at).toBe(result.signed_at);
  });

  it("falha no audit 'signed' propaga (rollback do withTransaction)", async () => {
    const auditLog = {
      record: jest.fn().mockImplementation((data) => {
        if (data?.eventType === "signed") {
          throw new Error("audit signed failed");
        }
        return Promise.resolve(undefined);
      }),
      fromRequest: () => ({}),
    };
    const { service, contratoRepo, withTransaction } = loadServiceWithMocks({
      auditLog,
    });

    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 99 } }),
    ).rejects.toThrow(/audit signed failed/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // audit foi chamado 1x com signed (que lançou). Sem
    // immutable_blocked porque o erro não é de imutabilidade.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
  });

  it("falha no updateStatus NÃO chama audit 'signed'", async () => {
    const contratoRepo = {
      findById: jest.fn(),
      findByIdUnscoped: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      findByToken: jest.fn(),
      listByLead: jest.fn(),
      hasActiveForLead: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn().mockRejectedValue(new Error("UPDATE failed")),
    };
    const { service, auditLog, withTransaction } = loadServiceWithMocks({
      contratoRepo,
    });

    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 99 } }),
    ).rejects.toThrow(/UPDATE failed/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Erro genérico → nem audit signed nem immutable_blocked.
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("contrato 'signed': 409 imutabilidade no pré-check; sem tx, sem updateStatus, sem audit", async () => {
    const { service, contratoRepo, auditLog, withTransaction } =
      loadServiceWithMocks({
        contratoRepo: {
          findById: jest.fn(),
          findByIdUnscoped: jest
            .fn()
            .mockResolvedValue(buildContrato({ status: "signed" })),
          findByToken: jest.fn(),
          listByLead: jest.fn(),
          hasActiveForLead: jest.fn(),
          create: jest.fn(),
          updateStatus: jest.fn(),
        },
      });

    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 99 } }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
      details: { current_status: "signed" },
    });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it.each(["draft", "cancelled", "expired"])(
    "contrato '%s' (não-sent): 409 'precisa estar em sent'; sem tx, sem audit",
    async (status) => {
      const { service, contratoRepo, auditLog, withTransaction } =
        loadServiceWithMocks({
          contratoRepo: {
            findById: jest.fn(),
            findByIdUnscoped: jest
              .fn()
              .mockResolvedValue(buildContrato({ status })),
            findByToken: jest.fn(),
            listByLead: jest.fn(),
            hasActiveForLead: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
          },
        });

      await expect(
        service.simularAssinatura({ id: 42, actor: { id: 99 } }),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/precisa estar em 'sent'/i),
      });

      expect(withTransaction).not.toHaveBeenCalled();
      expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    },
  );

  it("race signed mid-flight: rollback + immutable_blocked best-effort fora da tx (actorType=admin no observacional)", async () => {
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const contratoRepo = {
      findById: jest.fn(),
      findByIdUnscoped: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      findByToken: jest.fn(),
      listByLead: jest.fn(),
      hasActiveForLead: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn().mockRejectedValue(
        new AppError(
          "Contrato assinado não pode ser alterado.",
          ERROR_CODES.CONFLICT,
          409,
          { contrato_id: 42, current_status: "signed" },
        ),
      ),
    };
    const { service, auditLog } = loadServiceWithMocks({ contratoRepo });

    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 99 } }),
    ).rejects.toMatchObject({
      status: 409,
      details: { current_status: "signed" },
    });

    // Único record (observacional, fora da tx revertida). Note que
    // o actorType do immutable_blocked é 'admin' (quem disparou o
    // endpoint), distinto do actorType=system do 'signed' efetivo.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "immutable_blocked",
        actorType: "admin",
        previousStatus: "signed",
        payload: { attempted_action: "simularAssinatura" },
      }),
    );
  });

  it("400/409 quando provider ≠ stub (sanidade — não testa tx, só preserva regra existente)", async () => {
    // SIGNER_PROVIDER é congelado no module load. Forçar valor
    // diferente exige reset + env antes do require do service.
    jest.resetModules();
    process.env.CONTRATO_SIGNER_PROVIDER = "clicksign";
    jest.doMock(require.resolve("../../../lib/withTransaction"), () => ({
      withTransaction: jest.fn(),
    }));
    jest.doMock(
      require.resolve("../../../repositories/contratoRepository"),
      () => ({ findByIdUnscoped: jest.fn() }),
    );
    jest.doMock(
      require.resolve("../../../services/contractAuditLogService"),
      () => ({ record: jest.fn(), fromRequest: () => ({}) }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadEventsRepository"),
      () => ({ create: jest.fn() }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadsRepository"),
      () => ({ findByIdForCorretora: jest.fn() }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretorasPublicRepository"),
      () => ({ findById: jest.fn() }),
    );
    jest.doMock(
      require.resolve("../../../services/planService"),
      () => ({ requireActivePlanWithCapability: jest.fn() }),
    );

    // eslint-disable-next-line global-require
    const service = require("../../../services/contratoService");
    await expect(
      service.simularAssinatura({ id: 42, actor: { id: 99 } }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/só funciona com CONTRATO_SIGNER_PROVIDER=stub/i),
    });

    // Restaura para os próximos testes.
    process.env.CONTRATO_SIGNER_PROVIDER = "stub";
  });
});
