/**
 * test/unit/services/motoristaService.unit.test.js
 *
 * Cobre comportamento operacional do motorista:
 *   - autorizacao por motorista_id (403 quando rota e' de outro)
 *   - idempotencia via motorista_idempotency_keys
 *   - reportarProblema cria pedido_ocorrencia em transacao
 *   - fixarPosicao: insere histórico SEMPRE; promove pra pedidos.lat/lng so' se NULL
 *   - validacao de tipo de problema
 *   - validacao de lat/lng
 */

"use strict";

describe("services/motoristaService", () => {
  function loadWithMocks({
    rotaStub = null,
    paradaStub = null,
    poolQueryStub,
    txQueryStub,
    posicoesCreateStub = jest.fn().mockResolvedValue(123),
    posicoesPromoteStub = jest.fn().mockResolvedValue(true),
    paradaUpdateStub = jest.fn().mockResolvedValue(1),
    paradaFindByIdStub,
    rotasUpdateStatusStub = jest.fn().mockResolvedValue(1),
    rotasRecalcStub = jest.fn().mockResolvedValue(),
  } = {}) {
    jest.resetModules();

    const txConn = {
      query: txQueryStub ?? jest.fn(async (sql) => {
        if (/FROM pedidos WHERE id = \?/.test(sql)) {
          return [[{ usuario_id: 999 }]];
        }
        if (/INSERT INTO pedido_ocorrencias/.test(sql)) {
          return [{ insertId: 7777 }];
        }
        return [[]];
      }),
    };

    const idemRows = { byKey: new Map() };
    const poolQuery = poolQueryStub ?? jest.fn(async (sql, params) => {
      if (/SELECT id, response_status FROM motorista_idempotency_keys/.test(sql)) {
        const key = params[0];
        const found = idemRows.byKey.get(key);
        return [[found ? found : null].filter(Boolean), []];
      }
      if (/INSERT INTO motorista_idempotency_keys/.test(sql)) {
        idemRows.byKey.set(params[0], { id: 1, response_status: 200 });
        return [{ insertId: 1 }];
      }
      return [[]];
    });

    jest.doMock(require.resolve("../../../config/pool"), () => ({
      query: poolQuery,
      getConnection: jest.fn().mockResolvedValue({
        query: txConn.query,
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      }),
    }));

    jest.doMock(require.resolve("../../../repositories/rotasRepository"), () => ({
      findById: jest.fn().mockResolvedValue(rotaStub),
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: rotasUpdateStatusStub,
      deleteById: jest.fn(),
      recalcTotals: rotasRecalcStub,
      findActiveTodayForMotorista: jest.fn().mockResolvedValue(rotaStub),
    }));

    jest.doMock(
      require.resolve("../../../repositories/rotaParadasRepository"),
      () => ({
        findById: paradaFindByIdStub ?? jest.fn().mockResolvedValue(paradaStub),
        listByRotaId: jest.fn().mockResolvedValue([]),
        listItensDoPedido: jest.fn().mockResolvedValue([]),
        findActiveStopByPedidoId: jest.fn().mockResolvedValue(null),
        findByRotaAndPedido: jest.fn().mockResolvedValue(null),
        nextOrdem: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        deleteById: jest.fn(),
        deleteByRotaAndPedido: jest.fn(),
        updateOrdensBulk: jest.fn(),
        updateStatus: paradaUpdateStub,
      }),
    );

    jest.doMock(
      require.resolve("../../../repositories/pedidoPosicoesRepository"),
      () => ({
        create: posicoesCreateStub,
        listByPedido: jest.fn(),
        setPedidoLatLngIfEmpty: posicoesPromoteStub,
      }),
    );

    jest.doMock(
      require.resolve("../../../repositories/motoristasRepository"),
      () => ({ findById: jest.fn().mockResolvedValue({ id: 5, ativo: 1 }) }),
    );

    jest.doMock(require.resolve("../../../services/rotasService"), () => ({
      obterRotaCompleta: jest.fn().mockResolvedValue({ id: rotaStub?.id, paradas: [] }),
      alterarStatus: jest.fn().mockResolvedValue({ id: rotaStub?.id, status: "em_rota" }),
    }));

    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    return require("../../../services/motoristaService");
  }

  // ---------------------------------------------------------------------------
  // Autorizacao
  // ---------------------------------------------------------------------------

  test("rotaDetalhe: 403 quando rota nao e' do motorista", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, motorista_id: 99 },
    });
    await expect(svc.getRotaDetalhe(1, 5)).rejects.toMatchObject({ status: 403 });
  });

  test("marcarEntregue: 403 quando parada nao e' do motorista", async () => {
    const svc = loadWithMocks({
      paradaStub: { id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
                    rota_status: "em_rota", rota_motorista_id: 99 },
    });
    await expect(
      svc.marcarEntregue(50, 5, {}, {}),
    ).rejects.toMatchObject({ status: 403 });
  });

  // ---------------------------------------------------------------------------
  // Idempotencia
  // ---------------------------------------------------------------------------

  test("idempotencia: 2a chamada com mesmo idempotency-key NAO chama updateStatus de novo", async () => {
    const paradaStub = {
      id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
      rota_status: "em_rota", rota_motorista_id: 5,
    };
    const paradaUpdateStub = jest.fn().mockResolvedValue(1);
    const svc = loadWithMocks({ paradaStub, paradaUpdateStub });

    await svc.marcarEntregue(50, 5, {}, { idempotencyKey: "key-aaa-1234567890abcdef" });
    await svc.marcarEntregue(50, 5, {}, { idempotencyKey: "key-aaa-1234567890abcdef" });

    expect(paradaUpdateStub).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // marcarEntregue: precondicoes
  // ---------------------------------------------------------------------------

  test("marcarEntregue: requer rota em em_rota", async () => {
    const svc = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "pronta", rota_motorista_id: 5,
      },
    });
    await expect(svc.marcarEntregue(50, 5, {}, {})).rejects.toMatchObject({
      status: 409,
    });
  });

  test("marcarEntregue: idempotente quando ja' entregue (sem update)", async () => {
    const paradaUpdateStub = jest.fn().mockResolvedValue(1);
    const svc = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "entregue",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      paradaUpdateStub,
    });
    await svc.marcarEntregue(50, 5, {}, {});
    expect(paradaUpdateStub).not.toHaveBeenCalled();
  });

  test("marcarEntregue: happy path -> updateStatus + recalc + sync pedidos.status_entrega", async () => {
    const paradaUpdateStub = jest.fn().mockResolvedValue(1);
    const recalcStub = jest.fn().mockResolvedValue();
    const txQueryStub = jest.fn(async () => [[]]);
    const svc = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      paradaUpdateStub,
      rotasRecalcStub: recalcStub,
      txQueryStub,
    });
    await svc.marcarEntregue(50, 5, { observacao: "Entregue na porteira" }, {});
    expect(paradaUpdateStub).toHaveBeenCalledWith(
      50,
      expect.objectContaining({ status: "entregue", observacao_motorista: "Entregue na porteira" }),
      expect.anything(),
    );
    expect(recalcStub).toHaveBeenCalledWith(1, expect.anything());

    // Bug 1 — sincroniza pedidos.status_entrega na MESMA tx
    const updatePedidoCall = txQueryStub.mock.calls.find((c) =>
      /UPDATE pedidos SET status_entrega = 'entregue'/.test(c[0]),
    );
    expect(updatePedidoCall).toBeTruthy();
    expect(updatePedidoCall[1]).toEqual([100]); // pedido_id
  });

  // ---------------------------------------------------------------------------
  // reportarProblema
  // ---------------------------------------------------------------------------

  test("reportarProblema: rejeita tipo invalido", async () => {
    const svc = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
    });
    await expect(
      svc.reportarProblema(50, 5, { tipo: "qualquer_invalido" }, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("reportarProblema: cria pedido_ocorrencia em transacao + atualiza parada", async () => {
    const txQueryStub = jest.fn(async (sql) => {
      if (/FROM pedidos WHERE id = \?/.test(sql)) return [[{ usuario_id: 777 }]];
      if (/INSERT INTO pedido_ocorrencias/.test(sql)) return [{ insertId: 4242 }];
      return [[]];
    });
    const paradaUpdateStub = jest.fn().mockResolvedValue(1);
    const svc = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      txQueryStub,
      paradaUpdateStub,
    });

    await svc.reportarProblema(50, 5, { tipo: "cliente_ausente", observacao: "Casa fechada" }, {});

    // ocorrencia criada com tipo + usuario do pedido
    const insertCall = txQueryStub.mock.calls.find((c) =>
      /INSERT INTO pedido_ocorrencias/.test(c[0]),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][0]).toBe(100); // pedido_id
    expect(insertCall[1][1]).toBe(777); // usuario_id
    expect(insertCall[1][2]).toBe("cliente_ausente"); // tipo

    // parada atualizada com ocorrencia_id=4242
    expect(paradaUpdateStub).toHaveBeenCalledWith(
      50,
      expect.objectContaining({ status: "problema", ocorrencia_id: 4242 }),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // fixarPosicao
  // ---------------------------------------------------------------------------

  test("fixarPosicao: rejeita lat/lng fora dos limites", async () => {
    const svc = loadWithMocks({
      paradaStub: { id: 50, rota_id: 1, pedido_id: 100, rota_motorista_id: 5,
                    rota_status: "em_rota", status: "pendente" },
    });
    await expect(
      svc.fixarPosicao(50, 5, { latitude: 200, longitude: 0 }, {}),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      svc.fixarPosicao(50, 5, { latitude: 0, longitude: 999 }, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("fixarPosicao: insere historico SEMPRE; popula pedidos.lat/lng se NULL", async () => {
    const posicoesCreateStub = jest.fn().mockResolvedValue(123);
    const posicoesPromoteStub = jest.fn().mockResolvedValue(true);
    const svc = loadWithMocks({
      paradaStub: { id: 50, rota_id: 1, pedido_id: 100, rota_motorista_id: 5,
                    rota_status: "em_rota", status: "pendente" },
      posicoesCreateStub,
      posicoesPromoteStub,
    });
    const r = await svc.fixarPosicao(50, 5, { latitude: -20.123, longitude: -42.456 }, {});
    expect(posicoesCreateStub).toHaveBeenCalledWith(
      expect.objectContaining({ pedido_id: 100, motorista_id: 5, latitude: -20.123, longitude: -42.456 }),
    );
    expect(posicoesPromoteStub).toHaveBeenCalledWith(100, -20.123, -42.456);
    expect(r).toEqual({ posicao_id: 123, promovido_para_pedido: true });
  });

  test("fixarPosicao: NAO promove se promote retorna false (lat/lng ja' setados)", async () => {
    const posicoesPromoteStub = jest.fn().mockResolvedValue(false);
    const svc = loadWithMocks({
      paradaStub: { id: 50, rota_id: 1, pedido_id: 100, rota_motorista_id: 5,
                    rota_status: "em_rota", status: "pendente" },
      posicoesPromoteStub,
    });
    const r = await svc.fixarPosicao(50, 5, { latitude: -20, longitude: -42 }, {});
    expect(r.promovido_para_pedido).toBe(false);
  });
});
