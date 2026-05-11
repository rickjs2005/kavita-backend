// test/unit/repositories/contractAuditLogRepository.unit.test.js
//
// Cobre o INSERT/SELECT do contract_audit_log (Fase 10.5). Mocka o
// pool — não toca em MySQL.
"use strict";

function loadWithPool(poolMock) {
  jest.resetModules();
  jest.doMock(require.resolve("../../../config/pool"), () => poolMock);
  // eslint-disable-next-line global-require
  return require("../../../repositories/contractAuditLogRepository");
}

describe("contractAuditLogRepository.createEvent", () => {
  it("insere com todos os campos preenchidos e serializa payload JSON", async () => {
    const query = jest.fn().mockResolvedValueOnce([{ insertId: 99 }]);
    const repo = loadWithPool({ query });
    const id = await repo.createEvent({
      contrato_id: 42,
      corretora_id: 1,
      lead_id: 10,
      event_type: "created",
      actor_type: "corretora_user",
      actor_id: 7,
      ip: "10.0.0.1",
      user_agent: "Mozilla/5.0",
      previous_status: null,
      new_status: "draft",
      provider: null,
      provider_document_id: null,
      payload: { tipo: "disponivel", hash: "abc" },
    });
    expect(id).toBe(99);
    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(42); // contrato_id
    expect(params[3]).toBe("created"); // event_type
    expect(params[4]).toBe("corretora_user"); // actor_type
    // payload é stringified
    expect(typeof params[12]).toBe("string");
    expect(JSON.parse(params[12])).toEqual({ tipo: "disponivel", hash: "abc" });
  });

  it("aceita campos opcionais ausentes (null defaults)", async () => {
    const query = jest.fn().mockResolvedValueOnce([{ insertId: 100 }]);
    const repo = loadWithPool({ query });
    await repo.createEvent({
      contrato_id: 42,
      event_type: "downloaded",
      actor_type: "corretora_user",
    });
    const [, params] = query.mock.calls[0];
    expect(params[1]).toBe(null); // corretora_id
    expect(params[2]).toBe(null); // lead_id
    expect(params[5]).toBe(null); // actor_id
    expect(params[12]).toBe(null); // payload
  });

  it("trunca user_agent em 500 chars na inserção", async () => {
    const query = jest.fn().mockResolvedValueOnce([{ insertId: 1 }]);
    const repo = loadWithPool({ query });
    await repo.createEvent({
      contrato_id: 1,
      event_type: "downloaded",
      actor_type: "corretora_user",
      user_agent: "y".repeat(800),
    });
    const [, params] = query.mock.calls[0];
    expect(params[7].length).toBe(500); // user_agent
  });
});

describe("contractAuditLogRepository.listByContratoId", () => {
  it("retorna ordenado por created_at DESC, id DESC", async () => {
    const rows = [
      { id: 3, event_type: "signed", payload: '{"foo":"bar"}' },
      { id: 2, event_type: "sent_to_signature", payload: null },
      { id: 1, event_type: "created", payload: "{}" },
    ];
    const query = jest.fn().mockResolvedValueOnce([rows]);
    const repo = loadWithPool({ query });
    const list = await repo.listByContratoId(42);
    expect(list).toHaveLength(3);
    // hydrate transforma payload string em objeto
    expect(list[0].payload).toEqual({ foo: "bar" });
    expect(list[1].payload).toBe(null);
    expect(list[2].payload).toEqual({});
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY created_at DESC, id DESC/);
    expect(params[0]).toBe(42);
  });

  it("limita a janela e aplica clamp em [1, 500]", async () => {
    const query = jest.fn().mockResolvedValueOnce([[]]);
    const repo = loadWithPool({ query });
    await repo.listByContratoId(42, { limit: 9999 });
    const [, params] = query.mock.calls[0];
    expect(params[1]).toBe(500);
  });
});

describe("contractAuditLogRepository.listForAdmin", () => {
  it("aplica filtros e retorna paginação", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([[{ total: 23 }]])
      .mockResolvedValueOnce([
        [
          { id: 2, event_type: "signed", payload: null },
          { id: 1, event_type: "created", payload: null },
        ],
      ]);
    const repo = loadWithPool({ query });
    const result = await repo.listForAdmin({
      corretoraId: 1,
      eventType: "signed",
      page: 2,
      limit: 10,
    });
    expect(result.total).toBe(23);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    // SELECT da segunda chamada deve ter LIMIT 10 OFFSET 10
    const [, selectParams] = query.mock.calls[1];
    expect(selectParams[selectParams.length - 2]).toBe(10); // limit
    expect(selectParams[selectParams.length - 1]).toBe(10); // offset
  });
});
