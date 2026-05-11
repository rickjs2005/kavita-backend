// test/unit/services/contratoServiceSentToSignatureTransaction.unit.test.js
//
// Cobre a Fase 10.8 — UPDATE de transição draft→sent + audit
// "sent_to_signature" rodam no MESMO withTransaction quando o
// provider é stub. ClickSign (provider="clicksign") permanece como
// estava — fora do escopo desta etapa.
//
// Mesmo padrão dos testes de Created/Cancelled: mocka withTransaction
// como pass-through e inspeciona se as duas chamadas receberam a
// mesma conn.
"use strict";

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
  // SIGNER_PROVIDER é congelado no module load do contratoService.
  // Forçamos "stub" para garantir que o fluxo testado é o stub e
  // não delega ao contratoSignerService.enviarParaClickSign.
  process.env.CONTRATO_SIGNER_PROVIDER = "stub";

  const mockConn = mocks.mockConn ?? { __mock: "tx-conn-sent" };

  const withTransaction =
    mocks.withTransaction ?? jest.fn(async (fn) => fn(mockConn));
  jest.doMock(require.resolve("../../../lib/withTransaction"), () => ({
    withTransaction,
  }));

  const contratoRepo = mocks.contratoRepo ?? {
    findById: jest.fn().mockResolvedValue(buildContrato({ status: "draft" })),
    findByIdUnscoped: jest.fn(),
    findByToken: jest.fn(),
    listByLead: jest.fn(),
    hasActiveForLead: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  const leadsRepo = mocks.leadsRepo ?? {
    findByIdForCorretora: jest.fn(),
  };
  // enviarParaAssinatura revalida KYC + plano (defesa em profundidade
  // contra drafts antigos). Por padrão devolve corretora kyc verified
  // e plano ativo com capability.
  const publicCorretorasRepo = mocks.publicCorretorasRepo ?? {
    findById: jest.fn().mockResolvedValue({
      id: 1,
      name: "Corretora Y",
      cnpj: null,
      kyc_status: "verified",
    }),
  };
  const leadEventsRepo = mocks.leadEventsRepo ?? {
    create: jest.fn().mockResolvedValue(1),
  };
  const planService = mocks.planService ?? {
    requireActivePlanWithCapability: jest.fn().mockResolvedValue({}),
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

describe("contratoService.enviarParaAssinatura (stub) — atomicidade UPDATE + audit 'sent_to_signature'", () => {
  it("sucesso: updateStatus e auditLog.record recebem a MESMA conn da tx; provider=stub", async () => {
    const { service, contratoRepo, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks();

    const result = await service.enviarParaAssinatura({
      id: 42,
      corretoraId: 1,
      actor: { userId: 7 },
    });

    expect(result).toMatchObject({
      id: 42,
      status: "sent",
      signer_provider: "stub",
    });
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // updateStatus recebe (id, "sent", patch, conn)
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    const updateArgs = contratoRepo.updateStatus.mock.calls[0];
    expect(updateArgs[0]).toBe(42);
    expect(updateArgs[1]).toBe("sent");
    expect(updateArgs[2]).toMatchObject({
      signer_provider: "stub",
      // signer_document_id é dinâmico (uuid); apenas verifica forma.
      signer_document_id: expect.stringMatching(/^stub-/),
    });
    expect(updateArgs[2].sent_at).toBeInstanceOf(Date);
    expect(updateArgs[3]).toBe(mockConn);

    // audit recebe ({...}, { conn }) — provider="stub", document_id
    // estável entre updateStatus e audit (gravado a partir da
    // mesma variável local stubDocumentId), previous/new coerentes.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload).toMatchObject({
      contratoId: 42,
      corretoraId: 1,
      leadId: 10,
      eventType: "sent_to_signature",
      actorType: "corretora_user",
      actorId: 7,
      previousStatus: "draft",
      newStatus: "sent",
      provider: "stub",
    });
    expect(auditPayload.providerDocumentId).toBe(
      updateArgs[2].signer_document_id,
    );
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("falha no audit 'sent_to_signature' propaga (rollback do withTransaction)", async () => {
    const auditLog = {
      record: jest.fn().mockImplementation((data) => {
        if (data?.eventType === "sent_to_signature") {
          throw new Error("audit sent_to_signature failed");
        }
        return Promise.resolve(undefined);
      }),
      fromRequest: () => ({}),
    };
    const { service, contratoRepo, withTransaction } = loadServiceWithMocks({
      auditLog,
    });

    await expect(
      service.enviarParaAssinatura({
        id: 42,
        corretoraId: 1,
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/audit sent_to_signature failed/);

    // UPDATE foi tentado dentro do callback; rollback real do MySQL
    // desfaz na implementação.
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Audit foi chamado uma vez (com eventType=sent_to_signature,
    // que lançou). NÃO houve immutable_blocked (o erro não é da
    // imutabilidade do repo, é o próprio audit).
    expect(auditLog.record).toHaveBeenCalledTimes(1);
  });

  it("falha no updateStatus NÃO chama audit 'sent_to_signature'", async () => {
    const contratoRepo = {
      findById: jest.fn().mockResolvedValue(buildContrato({ status: "draft" })),
      findByIdUnscoped: jest.fn(),
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
      service.enviarParaAssinatura({
        id: 42,
        corretoraId: 1,
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/UPDATE failed/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Erro genérico (sem details.current_status) → nem audit
    // sent_to_signature nem immutable_blocked.
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("contrato 'signed': 409 imutabilidade no pré-check; sem tx, sem updateStatus, sem audit", async () => {
    const { service, contratoRepo, auditLog, withTransaction } =
      loadServiceWithMocks({
        contratoRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(buildContrato({ status: "signed" })),
          findByIdUnscoped: jest.fn(),
          findByToken: jest.fn(),
          listByLead: jest.fn(),
          hasActiveForLead: jest.fn(),
          create: jest.fn(),
          updateStatus: jest.fn(),
        },
      });

    await expect(
      service.enviarParaAssinatura({
        id: 42,
        corretoraId: 1,
        actor: { userId: 7 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
      details: { current_status: "signed" },
    });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
    // Pré-check de signed não emite audit (regra atual preservada
    // — só o repository defense-in-depth grava immutable_blocked).
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it.each(["sent", "cancelled", "expired"])(
    "contrato '%s' (não-draft): 409 'não está em rascunho'; sem tx, sem audit",
    async (status) => {
      const { service, contratoRepo, auditLog, withTransaction } =
        loadServiceWithMocks({
          contratoRepo: {
            findById: jest
              .fn()
              .mockResolvedValue(buildContrato({ status })),
            findByIdUnscoped: jest.fn(),
            findByToken: jest.fn(),
            listByLead: jest.fn(),
            hasActiveForLead: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
          },
        });

      await expect(
        service.enviarParaAssinatura({
          id: 42,
          corretoraId: 1,
          actor: { userId: 7 },
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/rascunho/i),
      });

      expect(withTransaction).not.toHaveBeenCalled();
      expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    },
  );

  it("race signed mid-flight: rollback + immutable_blocked best-effort fora da tx", async () => {
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const contratoRepo = {
      findById: jest.fn().mockResolvedValue(buildContrato({ status: "draft" })),
      findByIdUnscoped: jest.fn(),
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
      service.enviarParaAssinatura({
        id: 42,
        corretoraId: 1,
        actor: { userId: 7 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      details: { current_status: "signed" },
    });

    // Único registro fora da tx: immutable_blocked observacional.
    // Sem 'sent_to_signature' — a tx que envolvia ambos foi
    // revertida pelo erro do updateStatus.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "immutable_blocked",
        previousStatus: "signed",
        payload: expect.objectContaining({
          attempted_action: "sent_to_signature",
        }),
      }),
    );
  });
});
