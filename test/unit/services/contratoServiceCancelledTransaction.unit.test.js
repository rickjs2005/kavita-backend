// test/unit/services/contratoServiceCancelledTransaction.unit.test.js
//
// Cobre a Fase 10.7 — UPDATE de cancelamento + audit "cancelled"
// rodam dentro do MESMO withTransaction. Mesmo padrão dos testes de
// "created" (contratoServiceCreatedTransaction.unit.test.js): mocka
// withTransaction como pass-through do callback com conn fake, e
// inspeciona se as duas chamadas receberam a mesma referência.
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
  // contratoSignerService só carrega libs externas; força stub para o
  // service não pegar caminho de ClickSign por acidente.
  process.env.CONTRATO_SIGNER_PROVIDER = "stub";

  const mockConn = mocks.mockConn ?? { __mock: "tx-conn-cancel" };

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
  const publicCorretorasRepo = mocks.publicCorretorasRepo ?? {
    findById: jest.fn(),
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

describe("contratoService.cancelar — atomicidade UPDATE + audit 'cancelled'", () => {
  it("sucesso (draft): updateStatus e audit 'cancelled' recebem a MESMA conn da tx", async () => {
    const { service, contratoRepo, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks();
    const result = await service.cancelar({
      id: 42,
      corretoraId: 1,
      motivo: "ajuste no preço",
      actor: { userId: 7 },
    });
    expect(result).toEqual({ id: 42, status: "cancelled" });
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledWith(
      42,
      "cancelled",
      expect.objectContaining({ cancel_reason: "ajuste no preço" }),
      mockConn,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        contratoId: 42,
        corretoraId: 1,
        leadId: 10,
        eventType: "cancelled",
        actorType: "corretora_user",
        actorId: 7,
        previousStatus: "draft",
        newStatus: "cancelled",
        payload: { motivo: "ajuste no preço" },
      }),
      { conn: mockConn },
    );
  });

  it("sucesso (sent): caminho equivalente, previousStatus reflete o estado de partida", async () => {
    const { service, contratoRepo, auditLog, mockConn } = loadServiceWithMocks({
      contratoRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildContrato({ status: "sent" })),
        findByIdUnscoped: jest.fn(),
        findByToken: jest.fn(),
        listByLead: jest.fn(),
        hasActiveForLead: jest.fn(),
        create: jest.fn(),
        updateStatus: jest.fn().mockResolvedValue(undefined),
      },
    });
    await service.cancelar({
      id: 42,
      corretoraId: 1,
      motivo: "comprador desistiu",
      actor: { userId: 9 },
    });
    expect(contratoRepo.updateStatus).toHaveBeenCalledWith(
      42,
      "cancelled",
      expect.any(Object),
      mockConn,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: "sent",
        newStatus: "cancelled",
      }),
      { conn: mockConn },
    );
  });

  it("falha no audit 'cancelled' propaga o erro (withTransaction faz rollback no MySQL real)", async () => {
    const auditLog = {
      record: jest.fn().mockImplementation((data) => {
        if (data?.eventType === "cancelled") {
          throw new Error("audit cancelled failed");
        }
        return Promise.resolve(undefined);
      }),
      fromRequest: () => ({}),
    };
    const { service, contratoRepo, withTransaction } = loadServiceWithMocks({
      auditLog,
    });
    await expect(
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "motivo qualquer",
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/audit cancelled failed/);
    // O UPDATE foi tentado dentro do callback (e seria revertido pelo
    // rollback real do MySQL). withTransaction foi chamado 1x.
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // audit foi chamado uma única vez (com eventType=cancelled, que lançou).
    expect(auditLog.record).toHaveBeenCalledTimes(1);
  });

  it("falha no updateStatus NÃO chama audit 'cancelled'", async () => {
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
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "x",
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/UPDATE failed/);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Nem o cancelled nem o immutable_blocked: o erro é genérico, não
    // tem details.current_status === "signed".
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("pré-check 'signed': NÃO abre transação, NÃO chama updateStatus, NÃO chama audit", async () => {
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
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "tentativa indevida",
        actor: { userId: 7 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
      details: { current_status: "signed" },
    });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
    // A regra atual (preservada nesta etapa): o pré-check com findById
    // que detecta 'signed' lança SEM audit. Apenas a defesa em
    // profundidade do repository (race) grava immutable_blocked.
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("race signed mid-flight: updateStatus lança current_status=signed → rollback + immutable_blocked best-effort FORA da tx", async () => {
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
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "motivo",
        actor: { userId: 7 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      details: { current_status: "signed" },
    });
    // Único record (best-effort, fora da tx que foi revertida) é o
    // immutable_blocked observacional. NÃO houve audit 'cancelled'.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "immutable_blocked",
        previousStatus: "signed",
        payload: expect.objectContaining({
          attempted_action: "cancelled",
          motivo: "motivo",
        }),
      }),
    );
  });

  it("pré-check em status terminal (expired/cancelled): 409 genérico, sem tx, sem audit", async () => {
    const { service, contratoRepo, auditLog, withTransaction } =
      loadServiceWithMocks({
        contratoRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(buildContrato({ status: "expired" })),
          findByIdUnscoped: jest.fn(),
          findByToken: jest.fn(),
          listByLead: jest.fn(),
          hasActiveForLead: jest.fn(),
          create: jest.fn(),
          updateStatus: jest.fn(),
        },
      });
    await expect(
      service.cancelar({
        id: 42,
        corretoraId: 1,
        motivo: "x",
        actor: { userId: 7 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/não pode ser cancelado/i),
    });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});
