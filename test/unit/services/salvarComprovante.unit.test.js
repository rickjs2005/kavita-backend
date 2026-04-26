/**
 * test/unit/services/salvarComprovante.unit.test.js
 *
 * Fase 5 — comprovante de entrega. Cobre:
 *   - autorizacao por motorista_id (403 quando parada e' de outro)
 *   - exige rota em em_rota (409 caso contrario)
 *   - foto opcional + assinatura opcional + ambos opcionais (no-op)
 *   - chama mediaService.persistMedia com folder='entregas'
 *   - persiste paths via paradasRepo.updateComprovante
 *   - idempotencia via motorista_idempotency_keys (replay nao chama persist)
 */

"use strict";

describe("services/motoristaService.salvarComprovante (Fase 5)", () => {
  function loadWithMocks({
    paradaStub = null,
    paradaFindByIdStub,
    paradaUpdateComprovanteStub = jest.fn().mockResolvedValue(1),
    persistMediaStub = jest
      .fn()
      .mockResolvedValue([{ path: "/uploads/entregas/foto.jpg", key: "foo" }]),
    poolQueryStub,
  } = {}) {
    jest.resetModules();
    process.env.NODE_ENV = "test";

    const idemRows = { byKey: new Map() };
    const poolQuery =
      poolQueryStub ??
      jest.fn(async (sql, params) => {
        if (
          /SELECT id, response_status FROM motorista_idempotency_keys/.test(sql)
        ) {
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
        query: jest.fn().mockResolvedValue([[]]),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      }),
    }));

    jest.doMock(require.resolve("../../../repositories/rotasRepository"), () => ({
      findById: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      deleteById: jest.fn(),
      recalcTotals: jest.fn(),
      findActiveTodayForMotorista: jest.fn(),
    }));

    jest.doMock(
      require.resolve("../../../repositories/rotaParadasRepository"),
      () => ({
        findById:
          paradaFindByIdStub ?? jest.fn().mockResolvedValue(paradaStub),
        listByRotaId: jest.fn(),
        listItensDoPedido: jest.fn(),
        findActiveStopByPedidoId: jest.fn(),
        findByRotaAndPedido: jest.fn(),
        nextOrdem: jest.fn(),
        create: jest.fn(),
        deleteById: jest.fn(),
        deleteByRotaAndPedido: jest.fn(),
        updateOrdensBulk: jest.fn(),
        updateStatus: jest.fn(),
        updateComprovante: paradaUpdateComprovanteStub,
      }),
    );

    jest.doMock(
      require.resolve("../../../repositories/pedidoPosicoesRepository"),
      () => ({ create: jest.fn(), listByPedido: jest.fn(), setPedidoLatLngIfEmpty: jest.fn() }),
    );

    jest.doMock(
      require.resolve("../../../repositories/motoristasRepository"),
      () => ({ findById: jest.fn().mockResolvedValue({ id: 5, ativo: 1 }) }),
    );

    jest.doMock(require.resolve("../../../services/rotasService"), () => ({
      obterRotaCompleta: jest.fn(),
      alterarStatus: jest.fn(),
    }));

    jest.doMock(require.resolve("../../../services/mediaService"), () => ({
      persistMedia: persistMediaStub,
      upload: { single: jest.fn() },
      removeMedia: jest.fn(),
      enqueueOrphanCleanup: jest.fn(),
      storageType: "disk",
      toPublicPath: (s) => s,
    }));

    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    return {
      svc: require("../../../services/motoristaService"),
      persistMediaStub,
      paradaUpdateComprovanteStub,
    };
  }

  test("403 quando parada nao e' do motorista", async () => {
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 99,
      },
    });
    await expect(
      svc.salvarComprovante(50, 5, { foto: { buffer: Buffer.from("x") } }, {}),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("requer rota em em_rota", async () => {
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "pronta", rota_motorista_id: 5,
      },
    });
    await expect(
      svc.salvarComprovante(50, 5, { foto: { buffer: Buffer.from("x") } }, {}),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("ambos vazios -> no-op (nao chama persist nem update)", async () => {
    const { svc, persistMediaStub, paradaUpdateComprovanteStub } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
    });
    await svc.salvarComprovante(50, 5, {}, {});
    expect(persistMediaStub).not.toHaveBeenCalled();
    expect(paradaUpdateComprovanteStub).not.toHaveBeenCalled();
  });

  test("so' foto: persiste com folder='entregas' + atualiza coluna foto", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValue([
        { path: "/uploads/entregas/abc.jpg", key: "abc.jpg" },
      ]);
    const paradaUpdateComprovanteStub = jest.fn().mockResolvedValue(1);
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      persistMediaStub,
      paradaUpdateComprovanteStub,
    });
    const fakeFile = { buffer: Buffer.from("xxxxx"), mimetype: "image/jpeg", originalname: "f.jpg", size: 5 };
    await svc.salvarComprovante(50, 5, { foto: fakeFile }, {});
    expect(persistMediaStub).toHaveBeenCalledWith([fakeFile], { folder: "entregas" });
    expect(paradaUpdateComprovanteStub).toHaveBeenCalledWith(50, {
      comprovante_foto_url: "/uploads/entregas/abc.jpg",
    });
  });

  test("so' assinatura PNG base64: persiste como image/png + atualiza coluna assinatura", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValue([
        { path: "/uploads/entregas/sig.png", key: "sig.png" },
      ]);
    const paradaUpdateComprovanteStub = jest.fn().mockResolvedValue(1);
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      persistMediaStub,
      paradaUpdateComprovanteStub,
    });
    const buf = Buffer.from("fakepngbytes-fakepngbytes-fakepngbytes");
    await svc.salvarComprovante(
      50,
      5,
      { assinaturaPng: { buffer: buf, mimetype: "image/png" } },
      {},
    );
    const callArgs = persistMediaStub.mock.calls[0];
    expect(callArgs[0][0].mimetype).toBe("image/png");
    expect(callArgs[0][0].originalname).toMatch(/assinatura-parada-50/);
    expect(callArgs[1]).toEqual({ folder: "entregas" });
    expect(paradaUpdateComprovanteStub).toHaveBeenCalledWith(50, {
      assinatura_url: "/uploads/entregas/sig.png",
    });
  });

  test("foto + assinatura: 2 calls a persistMedia, 1 update com 2 campos", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValueOnce([{ path: "/uploads/entregas/foto.jpg" }])
      .mockResolvedValueOnce([{ path: "/uploads/entregas/sig.png" }]);
    const paradaUpdateComprovanteStub = jest.fn().mockResolvedValue(1);
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      persistMediaStub,
      paradaUpdateComprovanteStub,
    });
    await svc.salvarComprovante(
      50,
      5,
      {
        foto: { buffer: Buffer.from("x"), mimetype: "image/jpeg", originalname: "f.jpg", size: 1 },
        assinaturaPng: { buffer: Buffer.from("yyyy"), mimetype: "image/png" },
      },
      {},
    );
    expect(persistMediaStub).toHaveBeenCalledTimes(2);
    expect(paradaUpdateComprovanteStub).toHaveBeenCalledWith(50, {
      comprovante_foto_url: "/uploads/entregas/foto.jpg",
      assinatura_url: "/uploads/entregas/sig.png",
    });
  });

  test("idempotencia: 2a chamada com mesma idem-key NAO chama persist novamente", async () => {
    const persistMediaStub = jest
      .fn()
      .mockResolvedValue([{ path: "/uploads/entregas/x.jpg" }]);
    const { svc } = loadWithMocks({
      paradaStub: {
        id: 50, rota_id: 1, pedido_id: 100, status: "pendente",
        rota_status: "em_rota", rota_motorista_id: 5,
      },
      persistMediaStub,
    });
    const fakeFile = { buffer: Buffer.from("x"), mimetype: "image/jpeg", originalname: "f.jpg", size: 1 };
    await svc.salvarComprovante(50, 5, { foto: fakeFile }, { idempotencyKey: "key-comprovante-1234567890ab" });
    await svc.salvarComprovante(50, 5, { foto: fakeFile }, { idempotencyKey: "key-comprovante-1234567890ab" });
    expect(persistMediaStub).toHaveBeenCalledTimes(1);
  });
});
