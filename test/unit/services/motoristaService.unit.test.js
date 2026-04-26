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

  // ---------------------------------------------------------------------------
  // salvarComprovante (Fase 5) + atomicidade
  // ---------------------------------------------------------------------------

  function loadComprovanteMocks({
    paradaStub,
    persistMediaStub = jest.fn().mockResolvedValue([
      { path: "/uploads/entregas/123-uuid.png", key: "/abs/123-uuid.png" },
    ]),
    enqueueOrphanCleanupStub = jest.fn().mockResolvedValue(),
    updateComprovanteStub = jest.fn().mockResolvedValue(1),
    requireComprovante,
    requireComprovantePayload,
  } = {}) {
    jest.resetModules();
    if (requireComprovante === undefined) {
      delete process.env.MOTORISTA_REQUIRE_COMPROVANTE;
    } else {
      process.env.MOTORISTA_REQUIRE_COMPROVANTE = requireComprovante;
    }
    if (requireComprovantePayload === undefined) {
      delete process.env.MOTORISTA_REQUIRE_COMPROVANTE_PAYLOAD;
    } else {
      process.env.MOTORISTA_REQUIRE_COMPROVANTE_PAYLOAD = requireComprovantePayload;
    }

    const txConn = {
      query: jest.fn(async () => [[]]),
    };
    jest.doMock(require.resolve("../../../config/pool"), () => ({
      query: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn().mockResolvedValue({
        query: txConn.query,
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      }),
    }));
    jest.doMock(require.resolve("../../../repositories/rotasRepository"), () => ({
      findById: jest.fn().mockResolvedValue(null),
      recalcTotals: jest.fn().mockResolvedValue(),
    }));
    jest.doMock(
      require.resolve("../../../repositories/rotaParadasRepository"),
      () => ({
        findById: jest.fn().mockResolvedValue(paradaStub),
        listByRotaId: jest.fn().mockResolvedValue([]),
        listItensDoPedido: jest.fn().mockResolvedValue([]),
        updateStatus: jest.fn().mockResolvedValue(1),
        updateComprovante: updateComprovanteStub,
      }),
    );
    jest.doMock(
      require.resolve("../../../repositories/pedidoPosicoesRepository"),
      () => ({}),
    );
    jest.doMock(
      require.resolve("../../../repositories/motoristasRepository"),
      () => ({ findById: jest.fn().mockResolvedValue({ id: 5, ativo: 1 }) }),
    );
    jest.doMock(require.resolve("../../../services/rotasService"), () => ({
      obterRotaCompleta: jest.fn().mockResolvedValue({ paradas: [] }),
      alterarStatus: jest.fn(),
    }));
    jest.doMock(require.resolve("../../../services/mediaService"), () => ({
      persistMedia: persistMediaStub,
      enqueueOrphanCleanup: enqueueOrphanCleanupStub,
      removeMedia: jest.fn().mockResolvedValue(),
    }));
    const loggerStub = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(require.resolve("../../../lib/logger"), () => loggerStub);
    return Object.assign(require("../../../services/motoristaService"), {
      _loggerStub: loggerStub,
      _persistMediaStub: persistMediaStub,
      _enqueueOrphanCleanupStub: enqueueOrphanCleanupStub,
      _updateComprovanteStub: updateComprovanteStub,
    });
  }

  test("salvarComprovante: happy path com foto + assinatura", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValueOnce([{ path: "/uploads/entregas/foto.jpg", key: "/abs/foto.jpg" }])
      .mockResolvedValueOnce([{ path: "/uploads/entregas/sig.png", key: "/abs/sig.png" }]);
    const updateComprovanteStub = jest.fn().mockResolvedValue(1);
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, pedido_id: 73, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      persistMediaStub,
      updateComprovanteStub,
    });

    await svc.salvarComprovante(
      17, 6,
      {
        foto: { filename: "foto.jpg", originalname: "foto.jpg", mimetype: "image/jpeg" },
        assinaturaPng: { buffer: Buffer.from("png-bytes"), mimetype: "image/png" },
      },
      {},
    );

    expect(persistMediaStub).toHaveBeenCalledTimes(2);
    expect(updateComprovanteStub).toHaveBeenCalledWith(17, {
      comprovante_foto_url: "/uploads/entregas/foto.jpg",
      assinatura_url: "/uploads/entregas/sig.png",
    });
  });

  test("salvarComprovante: payload vazio + flag default OFF = no-op (preserva Fase 5)", async () => {
    const persistMediaStub = jest.fn();
    const updateComprovanteStub = jest.fn();
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      persistMediaStub,
      updateComprovanteStub,
    });
    await svc.salvarComprovante(17, 6, {}, {});
    expect(persistMediaStub).not.toHaveBeenCalled();
    expect(updateComprovanteStub).not.toHaveBeenCalled();
  });

  test("salvarComprovante: payload vazio + REQUIRE_PAYLOAD=true = 400 amigavel", async () => {
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      requireComprovantePayload: "true",
    });
    await expect(svc.salvarComprovante(17, 6, {}, {})).rejects.toMatchObject({
      status: 400,
    });
  });

  test("salvarComprovante: rota nao em_rota = 409 (sem persistir nada)", async () => {
    const persistMediaStub = jest.fn();
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "pronta", status: "pendente",
      },
      persistMediaStub,
    });
    await expect(
      svc.salvarComprovante(
        17, 6,
        { foto: { filename: "foto.jpg", originalname: "f.jpg", mimetype: "image/jpeg" } },
        {},
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(persistMediaStub).not.toHaveBeenCalled();
  });

  test("salvarComprovante: persistMedia da assinatura FALHA -> rollback da foto + UPDATE NAO ocorre", async () => {
    // Foto persiste, assinatura falha. Sem rollback, ficaria foto orfa no
    // disco + comprovante_foto_url no banco apontando pra URL valida.
    const persistMediaStub = jest
      .fn()
      .mockResolvedValueOnce([{ path: "/uploads/entregas/foto.jpg", key: "/abs/foto.jpg" }])
      .mockRejectedValueOnce(new Error("EIO disk full"));
    const updateComprovanteStub = jest.fn();
    const enqueueOrphanCleanupStub = jest.fn().mockResolvedValue();

    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      persistMediaStub,
      updateComprovanteStub,
      enqueueOrphanCleanupStub,
    });

    await expect(
      svc.salvarComprovante(
        17, 6,
        {
          foto: { filename: "foto.jpg", originalname: "f.jpg", mimetype: "image/jpeg" },
          assinaturaPng: { buffer: Buffer.from("png"), mimetype: "image/png" },
        },
        {},
      ),
    ).rejects.toThrow(/EIO disk full/);

    // CRITICO: foto orfa precisa ser removida
    expect(enqueueOrphanCleanupStub).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: "/uploads/entregas/foto.jpg" }),
      ]),
    );
    // E o UPDATE NUNCA foi chamado
    expect(updateComprovanteStub).not.toHaveBeenCalled();
  });

  test("salvarComprovante: TypeError do path.join e' reclassificado como AppError 500 amigavel", async () => {
    const persistMediaStub = jest.fn().mockImplementation(() => {
      const err = new TypeError(
        'The "path" argument must be of type string. Received undefined',
      );
      throw err;
    });
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      persistMediaStub,
    });

    const err = await svc
      .salvarComprovante(
        17, 6,
        { assinaturaPng: { buffer: Buffer.from("x"), mimetype: "image/png" } },
        {},
      )
      .catch((e) => e);
    expect(err).toMatchObject({ status: 500 });
    expect(err.message).toMatch(/midia invalida|Configuracao de upload/i);
    expect(svc._loggerStub.error).toHaveBeenCalledWith(
      expect.any(Object),
      "motorista.parada.comprovante.path_undefined",
    );
  });

  test("salvarComprovante: updateComprovante FALHA -> rollback de TODAS as midias", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValueOnce([{ path: "/uploads/entregas/foto.jpg", key: "/abs/foto.jpg" }])
      .mockResolvedValueOnce([{ path: "/uploads/entregas/sig.png", key: "/abs/sig.png" }]);
    const updateComprovanteStub = jest.fn().mockRejectedValue(new Error("DB down"));
    const enqueueOrphanCleanupStub = jest.fn().mockResolvedValue();

    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
      },
      persistMediaStub,
      updateComprovanteStub,
      enqueueOrphanCleanupStub,
    });

    await expect(
      svc.salvarComprovante(
        17, 6,
        {
          foto: { filename: "foto.jpg", originalname: "f.jpg", mimetype: "image/jpeg" },
          assinaturaPng: { buffer: Buffer.from("p"), mimetype: "image/png" },
        },
        {},
      ),
    ).rejects.toThrow(/DB down/);

    expect(enqueueOrphanCleanupStub).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: "/uploads/entregas/foto.jpg" }),
        expect.objectContaining({ path: "/uploads/entregas/sig.png" }),
      ]),
    );
  });

  // ---------------------------------------------------------------------------
  // marcarEntregue + REQUIRE_COMPROVANTE
  // ---------------------------------------------------------------------------

  test("marcarEntregue: REQUIRE_COMPROVANTE=true + parada SEM comprovante -> 409", async () => {
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, pedido_id: 73, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
        comprovante_foto_url: null, assinatura_url: null,
      },
      requireComprovante: "true",
    });
    await expect(svc.marcarEntregue(17, 6, {}, {})).rejects.toMatchObject({
      status: 409,
      details: { motivo: "comprovante_ausente" },
    });
  });

  test("marcarEntregue: REQUIRE_COMPROVANTE=true + parada com foto = passa", async () => {
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, pedido_id: 73, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
        comprovante_foto_url: "/uploads/entregas/foto.jpg", assinatura_url: null,
      },
      requireComprovante: "true",
    });
    // Nao deve lancar — segue ate updateStatus
    await expect(svc.marcarEntregue(17, 6, {}, {})).resolves.toBeDefined();
  });

  test("marcarEntregue: REQUIRE_COMPROVANTE default OFF = permite sem comprovante (Fase 5)", async () => {
    const svc = loadComprovanteMocks({
      paradaStub: {
        id: 17, rota_id: 12, pedido_id: 73, rota_motorista_id: 6,
        rota_status: "em_rota", status: "em_andamento",
        comprovante_foto_url: null, assinatura_url: null,
      },
      // sem requireComprovante = default OFF
    });
    await expect(svc.marcarEntregue(17, 6, {}, {})).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getRotaHoje: passa today em BRT pro repo (TZ-safe)
  // ---------------------------------------------------------------------------

  test("getRotaHoje: passa opts.today (YYYY-MM-DD em BRT) ao repo", async () => {
    // Spy no findActiveTodayForMotorista pra capturar opts.today
    jest.resetModules();
    const findActiveStub = jest.fn().mockResolvedValue(null);
    jest.doMock(require.resolve("../../../config/pool"), () => ({
      query: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn(),
    }));
    jest.doMock(require.resolve("../../../repositories/rotasRepository"), () => ({
      findActiveTodayForMotorista: findActiveStub,
      findById: jest.fn(),
    }));
    jest.doMock(
      require.resolve("../../../repositories/rotaParadasRepository"),
      () => ({}),
    );
    jest.doMock(
      require.resolve("../../../repositories/pedidoPosicoesRepository"),
      () => ({}),
    );
    jest.doMock(require.resolve("../../../services/rotasService"), () => ({
      obterRotaCompleta: jest.fn(),
    }));
    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    }));
    const svc = require("../../../services/motoristaService");
    await svc.getRotaHoje(6);

    expect(findActiveStub).toHaveBeenCalledTimes(1);
    const [motoristaId, opts] = findActiveStub.mock.calls[0];
    expect(motoristaId).toBe(6);
    expect(opts).toBeDefined();
    expect(opts.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Sanidade: data calculada deve casar com a data BRT computada agora.
    // Tolerancia de ±1 dia (caso o teste cruze meia-noite na propria run).
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    expect(opts.today).toBe(expected);
  });
});
