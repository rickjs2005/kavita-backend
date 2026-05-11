// test/unit/services/contratoSignerServiceTransaction.unit.test.js
//
// Cobre a Fase 10.11 — fluxo real ClickSign sob withTransaction:
//   - enviarParaClickSign: chamada HTTP fora; updateStatus + audit
//     'sent_to_signature' juntos na MESMA conn.
//   - processarEventoWebhook: download do PDF assinado fora; UPDATE
//     da transição (signed | cancelled | expired) + audit crítico
//     juntos na MESMA conn. Idempotência (webhook_applied) e
//     webhook_blocked seguem best-effort fora da tx.
//
// Mocks: withTransaction como pass-through (não toca MySQL real),
// clicksignAdapter / fs mockados para evitar HTTP/disco.
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
    data_fields: { __numero_externo: "KVT-LXJZ8K" },
    sent_at: null,
    signed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    signer_envelope_id: "env-123",
    ...overrides,
  };
}

function loadServiceWithMocks(mocks = {}) {
  jest.resetModules();

  const mockConn = mocks.mockConn ?? { __mock: "tx-conn-clicksign" };

  const withTransaction =
    mocks.withTransaction ?? jest.fn(async (fn) => fn(mockConn));
  jest.doMock(require.resolve("../../../lib/withTransaction"), () => ({
    withTransaction,
  }));

  const contratoRepo = mocks.contratoRepo ?? {
    findBySignerDocumentId: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  const leadsRepo = mocks.leadsRepo ?? {
    findByIdForCorretora: jest.fn().mockResolvedValue({
      id: 10,
      corretora_id: 1,
      nome: "João Silva",
      email: "joao@example.com",
      telefone: "31988887777",
    }),
  };
  const publicCorretorasRepo = mocks.publicCorretorasRepo ?? {
    findById: jest.fn().mockResolvedValue({
      id: 1,
      name: "Corretora Y",
      email: "responsavel@corretora-y.com",
      contact_name: "Maria Souza",
    }),
  };
  const leadEventsRepo = mocks.leadEventsRepo ?? {
    create: jest.fn().mockResolvedValue(1),
  };
  const auditLog = mocks.auditLog ?? {
    record: jest.fn().mockResolvedValue(undefined),
    fromRequest: () => ({}),
  };
  const clicksignAdapter = mocks.clicksignAdapter ?? {
    isConfigured: jest.fn().mockReturnValue(true),
    criarEnvelopeCompleto: jest
      .fn()
      .mockResolvedValue({ envelopeId: "env-123", documentId: "doc-456" }),
    baixarPdfAssinado: jest
      .fn()
      .mockResolvedValue(Buffer.from("signed-pdf-bytes")),
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
    require.resolve("../../../services/contractAuditLogService"),
    () => auditLog,
  );
  jest.doMock(
    require.resolve("../../../services/contratos/clicksignAdapter"),
    () => clicksignAdapter,
  );

  // fs/promises mockado para o readDraftPdf / persistSignedPdf não
  // tocarem disco. STORAGE_ROOT é prefixo verificado por path.resolve;
  // a string abaixo precisa "começar com" o cwd/storage/contratos.
  const path = require("path");
  const cwd = process.cwd();
  const fakeAbs = path
    .resolve(cwd, "storage", "contratos", "1", "abc.pdf")
    .replace(/\\/g, "/");
  // O service usa path.resolve(process.cwd(), contrato.pdf_url) — então
  // pdf_url precisa ser relativo. Já é (storage/contratos/...).

  jest.doMock("fs/promises", () => ({
    readFile: jest.fn().mockResolvedValue(Buffer.from("draft-pdf-bytes")),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  }));

  // eslint-disable-next-line global-require
  const service = require("../../../services/contratoSignerService");
  return {
    service,
    contratoRepo,
    auditLog,
    clicksignAdapter,
    leadEventsRepo,
    mockConn,
    withTransaction,
    fakeAbs,
  };
}

describe("contratoSignerService.enviarParaClickSign — atomicidade UPDATE + audit", () => {
  it("sucesso: chamada HTTP fora da tx; updateStatus e audit recebem a MESMA conn", async () => {
    const {
      service,
      contratoRepo,
      auditLog,
      clicksignAdapter,
      mockConn,
      withTransaction,
    } = loadServiceWithMocks();

    const contrato = buildContrato({ status: "draft" });
    const result = await service.enviarParaClickSign({
      contrato,
      actor: { userId: 7 },
    });

    expect(result).toMatchObject({
      id: 42,
      status: "sent",
      signer_provider: "clicksign",
      envelope_id: "env-123",
      document_id: "doc-456",
    });

    // HTTP foi chamado UMA vez ANTES de qualquer interação com a tx.
    expect(clicksignAdapter.criarEnvelopeCompleto).toHaveBeenCalledTimes(1);
    // withTransaction abriu uma vez.
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // updateStatus(id, "sent", patch, conn) com IDs da ClickSign.
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    const [, status, patch, connArg] =
      contratoRepo.updateStatus.mock.calls[0];
    expect(status).toBe("sent");
    expect(patch).toMatchObject({
      signer_provider: "clicksign",
      signer_envelope_id: "env-123",
      signer_document_id: "doc-456",
    });
    expect(patch.sent_at).toBeInstanceOf(Date);
    expect(connArg).toBe(mockConn);

    // audit sent_to_signature com provider="clicksign" e MESMA conn.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload).toMatchObject({
      contratoId: 42,
      eventType: "sent_to_signature",
      actorType: "corretora_user",
      previousStatus: "draft",
      newStatus: "sent",
      provider: "clicksign",
      providerDocumentId: "doc-456",
    });
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("falha no audit 'sent_to_signature' propaga (rollback do UPDATE pela tx)", async () => {
    const auditLog = {
      record: jest.fn().mockImplementation((data) => {
        if (data?.eventType === "sent_to_signature") {
          throw new Error("audit sent_to_signature failed");
        }
        return Promise.resolve(undefined);
      }),
      fromRequest: () => ({}),
    };
    const {
      service,
      contratoRepo,
      withTransaction,
      clicksignAdapter,
    } = loadServiceWithMocks({ auditLog });

    await expect(
      service.enviarParaClickSign({
        contrato: buildContrato({ status: "draft" }),
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/audit sent_to_signature failed/);

    expect(clicksignAdapter.criarEnvelopeCompleto).toHaveBeenCalledTimes(1);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Audit chamou 1x (sent_to_signature lançou) e NÃO houve
    // immutable_blocked (erro não é current_status=signed).
    expect(auditLog.record).toHaveBeenCalledTimes(1);
  });

  it("falha no updateStatus NÃO chama audit 'sent_to_signature'", async () => {
    const contratoRepo = {
      findBySignerDocumentId: jest.fn(),
      updateStatus: jest
        .fn()
        .mockRejectedValue(new Error("DB connection lost")),
    };
    const { service, auditLog, withTransaction } = loadServiceWithMocks({
      contratoRepo,
    });

    await expect(
      service.enviarParaClickSign({
        contrato: buildContrato({ status: "draft" }),
        actor: { userId: 7 },
      }),
    ).rejects.toThrow(/DB connection lost/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});

describe("contratoSignerService.processarEventoWebhook — atomicidade UPDATE + audit", () => {
  function buildEvent(overrides = {}) {
    return {
      document_id: "doc-456",
      status_hint: "signed",
      occurred_at: "2026-05-09T09:12:00.000Z",
      provider_event_id: "evt-001",
      ...overrides,
    };
  }

  it("status_hint=signed: download do PDF fora da tx; updateStatus + audit 'signed' com a mesma conn", async () => {
    const contratoRepo = {
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const { service, auditLog, clicksignAdapter, mockConn, withTransaction } =
      loadServiceWithMocks({ contratoRepo });

    const ret = await service.processarEventoWebhook(buildEvent());
    expect(ret).toEqual({
      applied: true,
      reason: "transitioned",
      contrato_id: 42,
    });

    // Download HTTP ocorreu UMA vez ANTES do UPDATE (fora da tx).
    expect(clicksignAdapter.baixarPdfAssinado).toHaveBeenCalledTimes(1);
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // UPDATE com signed + signed_pdf_url + signed_hash_sha256
    // recebe a conn da tx.
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    const [, status, patch, connArg] =
      contratoRepo.updateStatus.mock.calls[0];
    expect(status).toBe("signed");
    expect(patch.signed_at).toBeInstanceOf(Date);
    expect(typeof patch.signed_pdf_url).toBe("string");
    expect(patch.signed_hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(connArg).toBe(mockConn);

    // Audit "signed" actor=webhook, provider=clicksign, mesma conn.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload).toMatchObject({
      contratoId: 42,
      eventType: "signed",
      actorType: "webhook",
      previousStatus: "sent",
      newStatus: "signed",
      provider: "clicksign",
      providerDocumentId: "doc-456",
    });
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("status_hint=cancelled: UPDATE + audit 'cancelled' na mesma tx", async () => {
    const contratoRepo = {
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const { service, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks({ contratoRepo });

    await service.processarEventoWebhook(
      buildEvent({ status_hint: "cancelled", cancel_reason: "produtor desistiu" }),
    );

    expect(withTransaction).toHaveBeenCalledTimes(1);
    const [, status, patch, connArg] =
      contratoRepo.updateStatus.mock.calls[0];
    expect(status).toBe("cancelled");
    expect(patch.cancelled_at).toBeInstanceOf(Date);
    expect(patch.cancel_reason).toBe("produtor desistiu");
    expect(connArg).toBe(mockConn);

    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload).toMatchObject({
      eventType: "cancelled",
      actorType: "webhook",
      previousStatus: "sent",
      newStatus: "cancelled",
      provider: "clicksign",
    });
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("status_hint=expired: UPDATE + audit 'expired' na mesma tx", async () => {
    const contratoRepo = {
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const { service, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks({ contratoRepo });

    await service.processarEventoWebhook(
      buildEvent({ status_hint: "expired" }),
    );

    expect(withTransaction).toHaveBeenCalledTimes(1);
    const [, status, , connArg] =
      contratoRepo.updateStatus.mock.calls[0];
    expect(status).toBe("expired");
    expect(connArg).toBe(mockConn);

    const [auditPayload, auditOpts] = auditLog.record.mock.calls[0];
    expect(auditPayload.eventType).toBe("expired");
    expect(auditPayload.actorType).toBe("webhook");
    expect(auditOpts).toEqual({ conn: mockConn });
  });

  it("idempotência (já no status alvo): grava webhook_applied best-effort, sem abrir tx", async () => {
    const contratoRepo = {
      // Contrato JÁ está signed quando o webhook chega.
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "signed" })),
      updateStatus: jest.fn(),
    };
    const { service, auditLog, withTransaction } = loadServiceWithMocks({
      contratoRepo,
    });

    const ret = await service.processarEventoWebhook(
      buildEvent({ status_hint: "signed" }),
    );
    expect(ret).toEqual({ applied: true, reason: "already_at_target_status" });

    // SEM tx (não há transição) e SEM updateStatus.
    expect(withTransaction).not.toHaveBeenCalled();
    expect(contratoRepo.updateStatus).not.toHaveBeenCalled();

    // webhook_applied é o ÚNICO audit gravado — best-effort, sem
    // duplicar o evento crítico "signed" que já foi registrado no
    // momento da transição original.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "webhook_applied",
        actorType: "webhook",
        payload: expect.objectContaining({
          reason: "already_at_target_status",
        }),
      }),
    );
    // E NÃO foi chamado com 'signed' (sem duplicar evidência crítica).
    const signedCalls = auditLog.record.mock.calls.filter(
      ([p]) => p?.eventType === "signed",
    );
    expect(signedCalls).toHaveLength(0);
  });

  it("imutabilidade mid-flight (current_status=signed durante UPDATE): rollback + webhook_blocked best-effort fora da tx", async () => {
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const contratoRepo = {
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      updateStatus: jest.fn().mockRejectedValue(
        new AppError(
          "Contrato assinado não pode ser alterado.",
          ERROR_CODES.CONFLICT,
          409,
          { current_status: "signed" },
        ),
      ),
    };
    const { service, auditLog } = loadServiceWithMocks({ contratoRepo });

    await expect(
      service.processarEventoWebhook(
        buildEvent({ status_hint: "cancelled" }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      details: { current_status: "signed" },
    });

    // Único audit é webhook_blocked observacional fora da tx.
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "webhook_blocked",
        actorType: "webhook",
        previousStatus: "signed",
        provider: "clicksign",
        payload: expect.objectContaining({
          attempted_status: "cancelled",
          reason: "immutable_signed",
        }),
      }),
    );
    // Sem audit do evento crítico cancelled — tx foi revertida.
    const criticalCalls = auditLog.record.mock.calls.filter(
      ([p]) => p?.eventType === "cancelled",
    );
    expect(criticalCalls).toHaveLength(0);
  });

  it("falha no UPDATE genérico (não imutabilidade): propaga erro sem audit crítico nem webhook_blocked", async () => {
    const contratoRepo = {
      findBySignerDocumentId: jest
        .fn()
        .mockResolvedValue(buildContrato({ status: "sent" })),
      updateStatus: jest.fn().mockRejectedValue(new Error("UPDATE failed")),
    };
    const { service, auditLog, withTransaction } = loadServiceWithMocks({
      contratoRepo,
    });

    await expect(
      service.processarEventoWebhook(
        buildEvent({ status_hint: "signed" }),
      ),
    ).rejects.toThrow(/UPDATE failed/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.updateStatus).toHaveBeenCalledTimes(1);
    // Sem audit nenhum (erro genérico, não tem current_status=signed).
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});
