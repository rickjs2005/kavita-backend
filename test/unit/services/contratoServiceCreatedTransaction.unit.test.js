// test/unit/services/contratoServiceCreatedTransaction.unit.test.js
//
// Cobre a regra "INSERT do contrato + audit 'created' rodam na mesma
// transação" (Fase 10.6). Mocka tudo que cerca a regra (Puppeteer,
// QRCode, Handlebars, fs, repos, planService) para isolar a parte
// transacional sem tocar disco/banco.
"use strict";

function loadServiceWithMocks(mocks = {}) {
  jest.resetModules();
  // Service congela CONTRATO_SIGNER_PROVIDER no load — força stub
  // para o caminho da geração não tentar ClickSign de verdade.
  process.env.CONTRATO_SIGNER_PROVIDER = "stub";

  const mockConn = mocks.mockConn ?? { __mock: "tx-conn" };

  // withTransaction simula a interface real: chama o callback com a
  // conexão e devolve o valor de retorno. Quando o callback lança,
  // propaga (que é o comportamento depois do rollback automático).
  const withTransaction =
    mocks.withTransaction ?? jest.fn(async (fn) => fn(mockConn));
  jest.doMock(require.resolve("../../../lib/withTransaction"), () => ({
    withTransaction,
  }));

  // ─── Repos ─────────────────────────────────────────────────────────────
  const contratoRepo = mocks.contratoRepo ?? {
    create: jest.fn().mockResolvedValue(42),
    hasActiveForLead: jest.fn().mockResolvedValue(false),
    findById: jest.fn(),
    findByIdUnscoped: jest.fn(),
    findByToken: jest.fn(),
    listByLead: jest.fn(),
    updateStatus: jest.fn(),
  };
  const leadsRepo = mocks.leadsRepo ?? {
    findByIdForCorretora: jest.fn().mockResolvedValue({
      id: 10,
      corretora_id: 1,
      status: "closed",
      nome: "Produtor X",
      telefone: "31988887777",
      email: null,
      cidade: "Manhuaçu",
    }),
  };
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

  // ─── Libs externas (não tocar disco/Chromium) ─────────────────────────
  jest.doMock("puppeteer", () => ({
    launch: jest.fn(() =>
      Promise.resolve({
        newPage: () =>
          Promise.resolve({
            setContent: jest.fn(),
            pdf: jest.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
            close: jest.fn(),
          }),
      }),
    ),
  }));
  jest.doMock("qrcode", () => ({
    toDataURL: jest
      .fn()
      .mockResolvedValue("data:image/png;base64,fake"),
  }));
  jest.doMock("handlebars", () => {
    const compiled = jest.fn(() => "<html>fake</html>");
    return {
      compile: jest.fn(() => compiled),
      registerHelper: jest.fn(),
    };
  });
  jest.doMock("fs/promises", () => ({
    readFile: jest.fn().mockResolvedValue("template-mock"),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  }));

  // eslint-disable-next-line global-require
  const service = require("../../../services/contratoService");
  return {
    service,
    contratoRepo,
    auditLog,
    mockConn,
    withTransaction,
    planService,
    leadsRepo,
    publicCorretorasRepo,
  };
}

const validDataFields = {
  safra: "2025/2026",
  bebida_laudo: "Dura",
  quantidade_sacas: 200,
  preco_saca: 1450,
  prazo_pagamento_dias: 15,
  nome_armazem_ou_fazenda: "Armazém X",
};

describe("contratoService.gerarContrato — atomicidade INSERT + audit 'created'", () => {
  it("envelopa contratoRepo.create + audit 'created' numa única transação, propagando conn", async () => {
    const { service, contratoRepo, auditLog, mockConn, withTransaction } =
      loadServiceWithMocks();

    const result = await service.gerarContrato({
      leadId: 10,
      corretoraId: 1,
      tipo: "disponivel",
      dataFields: validDataFields,
      createdByUserId: 7,
    });

    expect(result).toMatchObject({
      id: 42,
      status: "draft",
      tipo: "disponivel",
    });
    // withTransaction foi chamado exatamente uma vez
    expect(withTransaction).toHaveBeenCalledTimes(1);
    // contratoRepo.create foi chamado COM a conn da transação
    expect(contratoRepo.create).toHaveBeenCalledTimes(1);
    expect(contratoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 10,
        corretora_id: 1,
        tipo: "disponivel",
      }),
      mockConn,
    );
    // auditLog.record foi chamado COM { conn } da transação e
    // eventType="created" — único caminho considerado crítico aqui.
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        contratoId: 42,
        corretoraId: 1,
        leadId: 10,
        eventType: "created",
        actorType: "corretora_user",
        actorId: 7,
        newStatus: "draft",
      }),
      { conn: mockConn },
    );
  });

  it("rollback: se o audit 'created' falhar, withTransaction propaga erro e o erro chega ao caller", async () => {
    const auditLog = {
      record: jest.fn().mockImplementation(() => {
        throw new Error("audit critical failed");
      }),
      fromRequest: () => ({}),
    };
    const { service, contratoRepo, withTransaction } = loadServiceWithMocks({
      auditLog,
    });

    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: validDataFields,
        createdByUserId: 7,
      }),
    ).rejects.toThrow(/audit critical failed/);

    // withTransaction foi entrado, contrato INSERT ocorreu dentro do
    // callback, mas o audit lançou — em produção isso aciona o
    // rollback do MySQL. Aqui validamos que o erro PROPAGA (não foi
    // silenciado) e que o INSERT foi tentado dentro do callback.
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledTimes(1);
  });

  it("se contratoRepo.create falhar, auditLog.record NÃO é chamado (e o erro propaga)", async () => {
    const contratoRepo = {
      create: jest.fn().mockRejectedValue(new Error("INSERT failed")),
      hasActiveForLead: jest.fn().mockResolvedValue(false),
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
      findByToken: jest.fn(),
      listByLead: jest.fn(),
      updateStatus: jest.fn(),
    };
    const { service, auditLog, withTransaction } = loadServiceWithMocks({
      contratoRepo,
    });

    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: validDataFields,
        createdByUserId: 7,
      }),
    ).rejects.toThrow(/INSERT failed/);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(contratoRepo.create).toHaveBeenCalledTimes(1);
    // Audit "created" NÃO foi disparado porque o create lançou antes.
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("usa o helper withTransaction do projeto (rollback real garante atomicidade no MySQL)", async () => {
    // Validação de integração: o service importa lib/withTransaction
    // e o passa como callback assíncrono. Aqui inspecionamos a
    // assinatura do withTransaction mockado: ele recebe uma função
    // async e a executa com um único argumento (a conn).
    const { service, withTransaction, mockConn } = loadServiceWithMocks();
    await service.gerarContrato({
      leadId: 10,
      corretoraId: 1,
      tipo: "disponivel",
      dataFields: validDataFields,
      createdByUserId: 7,
    });
    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function));
    // o callback recebido pelo withTransaction usa o mockConn —
    // garantido pelos asserts dos outros testes (create/record com
    // mockConn). Aqui só confirmamos a integração estrutural.
    expect(mockConn).toBeDefined();
  });
});
