// test/unit/services/contractAuditLogService.unit.test.js
//
// Cobre a política de criticidade do contractAuditLogService (Fase 10.5):
//   - record() crítico lança quando repo falha
//   - record() best-effort silencia quando repo falha
//   - fromRequest() extrai ip/user_agent corretamente
//   - validação de campos obrigatórios e actor_type
//
// Mocka o repository — não toca em pool nem banco.
"use strict";

function load(repoMock) {
  jest.resetModules();
  jest.doMock(
    require.resolve("../../../repositories/contractAuditLogRepository"),
    () => repoMock,
  );
  // eslint-disable-next-line global-require
  return require("../../../services/contractAuditLogService");
}

describe("contractAuditLogService.record", () => {
  it("insere payload correto chamando o repo (caminho positivo)", async () => {
    const createEvent = jest.fn().mockResolvedValue(1);
    const svc = load({ createEvent });
    await svc.record({
      contratoId: 42,
      corretoraId: 1,
      leadId: 10,
      eventType: "created",
      actorType: "corretora_user",
      actorId: 7,
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0",
      newStatus: "draft",
      payload: { tipo: "disponivel", hash_sha256: "a".repeat(64) },
    });
    expect(createEvent).toHaveBeenCalledTimes(1);
    // Fase 10.6 — `record` agora passa (data, conn) ao repo. Aqui
    // o caller não está em transação, então conn é undefined e o
    // repo cai no default param (pool). O contrato do INSERT em si
    // permanece igual.
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        contrato_id: 42,
        corretora_id: 1,
        lead_id: 10,
        event_type: "created",
        actor_type: "corretora_user",
        actor_id: 7,
        ip: "10.0.0.1",
        user_agent: "Mozilla/5.0",
        new_status: "draft",
        payload: expect.objectContaining({ tipo: "disponivel" }),
      }),
      undefined,
    );
  });

  it("propaga a conexão transacional para o repository quando passada via { conn }", async () => {
    const createEvent = jest.fn().mockResolvedValue(2);
    const svc = load({ createEvent });
    const fakeConn = { __mock: "tx-conn" };
    await svc.record(
      {
        contratoId: 42,
        eventType: "created",
        actorType: "corretora_user",
        actorId: 7,
        newStatus: "draft",
        payload: { tipo: "disponivel" },
      },
      { conn: fakeConn },
    );
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contrato_id: 42, event_type: "created" }),
      fakeConn,
    );
  });

  it("lança AppError 500 quando event_type é crítico e o repo falha", async () => {
    const createEvent = jest.fn().mockRejectedValue(new Error("DB down"));
    const svc = load({ createEvent });
    await expect(
      svc.record({
        contratoId: 42,
        eventType: "signed",
        actorType: "webhook",
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/Falha ao registrar auditoria/i),
      details: { event_type: "signed", contrato_id: 42 },
    });
  });

  it("silencia (best-effort) quando event_type é observacional e o repo falha", async () => {
    const createEvent = jest.fn().mockRejectedValue(new Error("DB down"));
    const svc = load({ createEvent });
    await expect(
      svc.record({
        contratoId: 42,
        eventType: "downloaded",
        actorType: "corretora_user",
      }),
    ).resolves.toBeUndefined();
  });

  it("permite override explícito de critical para downloaded", async () => {
    const createEvent = jest.fn().mockRejectedValue(new Error("DB down"));
    const svc = load({ createEvent });
    await expect(
      svc.record({
        contratoId: 42,
        eventType: "downloaded",
        actorType: "corretora_user",
        critical: true,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejeita actorType fora do ENUM (erro de programação)", async () => {
    const svc = load({ createEvent: jest.fn() });
    await expect(
      svc.record({
        contratoId: 42,
        eventType: "created",
        actorType: "INVALID_ACTOR",
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/actorType inválido/i),
    });
  });

  it("rejeita quando faltam campos obrigatórios", async () => {
    const svc = load({ createEvent: jest.fn() });
    await expect(svc.record({ eventType: "created" })).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/obrigatórios/i),
    });
  });
});

describe("contractAuditLogService.fromRequest", () => {
  it("extrai ip e user_agent do request", () => {
    jest.resetModules();
    jest.doMock(
      require.resolve("../../../repositories/contractAuditLogRepository"),
      () => ({ createEvent: jest.fn() }),
    );
    // eslint-disable-next-line global-require
    const svc = require("../../../services/contractAuditLogService");

    const req = {
      ip: "10.0.0.5",
      headers: { "user-agent": "Mozilla/5.0 KavitaTests" },
    };
    expect(svc.fromRequest(req)).toEqual({
      ip: "10.0.0.5",
      userAgent: "Mozilla/5.0 KavitaTests",
    });
  });

  it("trunca user_agent em 500 caracteres", () => {
    jest.resetModules();
    jest.doMock(
      require.resolve("../../../repositories/contractAuditLogRepository"),
      () => ({ createEvent: jest.fn() }),
    );
    // eslint-disable-next-line global-require
    const svc = require("../../../services/contractAuditLogService");

    const longUa = "x".repeat(800);
    const req = { ip: "1.1.1.1", headers: { "user-agent": longUa } };
    const ctx = svc.fromRequest(req);
    expect(ctx.userAgent.length).toBe(500);
  });

  it("retorna objeto vazio quando req é null/undefined", () => {
    jest.resetModules();
    jest.doMock(
      require.resolve("../../../repositories/contractAuditLogRepository"),
      () => ({ createEvent: jest.fn() }),
    );
    // eslint-disable-next-line global-require
    const svc = require("../../../services/contractAuditLogService");

    expect(svc.fromRequest(null)).toEqual({});
    expect(svc.fromRequest(undefined)).toEqual({});
  });
});
