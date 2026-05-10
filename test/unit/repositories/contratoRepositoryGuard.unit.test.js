// test/unit/repositories/contratoRepositoryGuard.unit.test.js
//
// Garante que repositories/contratoRepository.updateStatus efetivamente
// rejeita UPDATE em contrato 'signed' (Fase 10.4 — imutabilidade
// pós-assinatura). Defesa em profundidade: mesmo se o caller esquecer
// o guard no service, o SQL não casa e levantamos AppError 409.
//
// Mocka apenas o `pool` para simular a resposta do MySQL.
"use strict";

describe("contratoRepository.updateStatus — guard signed imutável", () => {
  function loadRepoWithPool(poolMock) {
    jest.resetModules();
    jest.doMock(require.resolve("../../../config/pool"), () => poolMock);
    // eslint-disable-next-line global-require
    return require("../../../repositories/contratoRepository");
  }

  it("permite transição sent → signed (caminho ClickSign)", async () => {
    const queryMock = jest.fn().mockResolvedValueOnce([{ affectedRows: 1 }]);
    const repo = loadRepoWithPool({ query: queryMock });
    await expect(
      repo.updateStatus(42, "signed", { signed_at: new Date() }),
    ).resolves.toBeUndefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/AND status <> 'signed'/);
  });

  it("rejeita update quando contrato já está signed (affectedRows=0 e SELECT confirma)", async () => {
    const queryMock = jest
      .fn()
      // 1) UPDATE retorna 0 linhas afetadas (porque AND status<>'signed')
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      // 2) SELECT subsequente confirma que o status atual é 'signed'
      .mockResolvedValueOnce([[{ status: "signed" }]]);
    const repo = loadRepoWithPool({ query: queryMock });
    await expect(
      repo.updateStatus(42, "cancelled", { cancel_reason: "x" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Contrato assinado não pode ser alterado.",
      details: { current_status: "signed", contrato_id: 42 },
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("retorna 404 quando contrato não existe", async () => {
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[]]);
    const repo = loadRepoWithPool({ query: queryMock });
    await expect(repo.updateStatus(999, "sent", {})).rejects.toMatchObject({
      status: 404,
      message: "Contrato não encontrado.",
    });
  });

  it("é idempotente quando affectedRows=0 mas status atual difere de signed (sem efeito)", async () => {
    // Race condition leve entre o pre-check do service e o UPDATE,
    // ou status já no alvo. O repository não lança nesse caminho —
    // o service decide se trata como noop.
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ status: "draft" }]]);
    const repo = loadRepoWithPool({ query: queryMock });
    await expect(
      repo.updateStatus(42, "sent", { sent_at: new Date() }),
    ).resolves.toBeUndefined();
  });
});
