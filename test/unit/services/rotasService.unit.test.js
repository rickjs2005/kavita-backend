/**
 * test/unit/services/rotasService.unit.test.js
 *
 * Cobre regras criticas do rotasService:
 *   - FSM: transicoes validas vs invalidas
 *   - Bloqueio de edicao em em_rota
 *   - Anti-dup: pedido em rota ativa nao entra em outra
 *   - Adicionar idempotente (mesmo pedido na mesma rota)
 *   - alterarStatus: pre-condicoes para em_rota (motorista + paradas)
 */

"use strict";

describe("services/rotasService", () => {
  function loadWithMocks({
    rotaStub,
    motoristaStub,
    pedidoStub,
    paradaActiveStub,
    paradaSameStub,
    nextOrdemStub = jest.fn().mockResolvedValue(1),
    createParadaStub = jest.fn().mockResolvedValue(99),
    findParadaByIdStub,
    listParadasStub = jest.fn().mockResolvedValue([]),
    listItensStub = jest.fn().mockResolvedValue([]),
    recalcStub = jest.fn().mockResolvedValue(),
    updateStatusStub = jest.fn().mockResolvedValue(1),
    updateRotaStub = jest.fn().mockResolvedValue(1),
    createRotaStub = jest.fn().mockResolvedValue(10),
    deletaParadaStub = jest.fn().mockResolvedValue(1),
    poolQueryStub,
    txQueryStub,
    requestMagicLinkStub = jest.fn().mockResolvedValue({
      whatsapp: { provider: "manual", status: "manual_pending", url: "wa.me/...", erro: null },
      delivered: false,
    }),
    whatsappProviderStub = jest.fn(() => "manual"),
    autoSendEnv,
    requiresApiEnv,
  } = {}) {
    jest.resetModules();
    if (autoSendEnv === undefined) {
      delete process.env.MOTORISTA_MAGIC_LINK_AUTO_SEND;
    } else {
      process.env.MOTORISTA_MAGIC_LINK_AUTO_SEND = autoSendEnv;
    }
    if (requiresApiEnv === undefined) {
      delete process.env.MOTORISTA_AUTO_SEND_REQUIRES_API;
    } else {
      process.env.MOTORISTA_AUTO_SEND_REQUIRES_API = requiresApiEnv;
    }

    // Mock conn.query usado nas tx (assertPedidoElegivel etc)
    const txConn = {
      query: txQueryStub ?? jest.fn(async (sql, params) => {
        if (/FROM pedidos WHERE id = \?/.test(sql)) {
          return [[{ id: params[0], status_pagamento: pedidoStub?.status_pagamento || "pago" }]];
        }
        return [[]];
      }),
    };

    jest.doMock(require.resolve("../../../config/pool"), () => ({
      query: poolQueryStub ?? jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn().mockResolvedValue({
        query: txConn.query,
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      }),
    }));

    jest.doMock(require.resolve("../../../repositories/rotasRepository"), () => ({
      findById: jest.fn().mockResolvedValue(rotaStub ?? null),
      list: jest.fn().mockResolvedValue([]),
      create: createRotaStub,
      update: updateRotaStub,
      updateStatus: updateStatusStub,
      deleteById: jest.fn().mockResolvedValue(1),
      recalcTotals: recalcStub,
      findActiveTodayForMotorista: jest.fn().mockResolvedValue(null),
    }));

    jest.doMock(
      require.resolve("../../../repositories/rotaParadasRepository"),
      () => ({
        findById: findParadaByIdStub ?? jest.fn().mockResolvedValue({
          id: 99, rota_id: rotaStub?.id ?? 1, pedido_id: 100, ordem: 1, status: "pendente",
        }),
        listByRotaId: listParadasStub,
        listItensDoPedido: listItensStub,
        findActiveStopByPedidoId: jest.fn().mockResolvedValue(paradaActiveStub ?? null),
        findByRotaAndPedido: jest.fn().mockResolvedValue(paradaSameStub ?? null),
        nextOrdem: nextOrdemStub,
        create: createParadaStub,
        deleteById: jest.fn().mockResolvedValue(1),
        deleteByRotaAndPedido: deletaParadaStub,
        updateOrdensBulk: jest.fn().mockResolvedValue(),
        updateStatus: jest.fn().mockResolvedValue(1),
      }),
    );

    jest.doMock(
      require.resolve("../../../repositories/motoristasRepository"),
      () => ({
        findById: jest.fn().mockResolvedValue(motoristaStub ?? null),
      }),
    );

    const loggerStub = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(require.resolve("../../../lib/logger"), () => loggerStub);

    jest.doMock(
      require.resolve("../../../services/motoristaAuthService"),
      () => ({
        requestMagicLink: requestMagicLinkStub,
      }),
    );

    jest.doMock(require.resolve("../../../services/whatsapp"), () => ({
      sendWhatsapp: jest.fn(),
      getProvider: whatsappProviderStub,
      buildWaMeLink: jest.fn(),
      normalizePhoneBR: jest.fn(),
    }));

    const svc = require("../../../services/rotasService");
    return {
      ...svc,
      _requestMagicLinkStub: requestMagicLinkStub,
      _loggerStub: loggerStub,
      _providerStub: whatsappProviderStub,
    };
  }

  // Espera o microtask do fire-and-forget do _maybeAutoSendMagicLink
  // resolver antes de inspecionar o stub.
  function flushMicrotasks() {
    return new Promise((r) => setImmediate(r));
  }

  // ---------------------------------------------------------------------------
  // criarRota
  // ---------------------------------------------------------------------------

  test("criarRota: rejeita sem data_programada", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 10, status: "rascunho", motorista_id: null, total_paradas: 0 },
    });
    await expect(
      svc.criarRota({ data_programada: null }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("criarRota: rejeita motorista inativo", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 5, ativo: 0, nome: "X" },
    });
    await expect(
      svc.criarRota({ data_programada: "2026-04-26", motorista_id: 5 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  // ---------------------------------------------------------------------------
  // FSM transicoes
  // ---------------------------------------------------------------------------

  test("alterarStatus: rascunho -> em_rota direto e' invalido", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 1, total_paradas: 1, iniciada_em: null },
    });
    await expect(svc.alterarStatus(1, "em_rota")).rejects.toMatchObject({
      status: 409,
    });
  });

  test("alterarStatus: pronta -> em_rota exige motorista", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: null, total_paradas: 3 },
    });
    await expect(svc.alterarStatus(1, "em_rota")).rejects.toMatchObject({
      status: 409,
    });
  });

  test("alterarStatus: pronta -> em_rota exige >=1 parada", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 5, total_paradas: 0 },
    });
    await expect(svc.alterarStatus(1, "em_rota")).rejects.toMatchObject({
      status: 409,
    });
  });

  test("alterarStatus: pronta -> em_rota happy path seta iniciada_em", async () => {
    const updateStatusStub = jest.fn().mockResolvedValue(1);
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 5, total_paradas: 3, iniciada_em: null },
      updateStatusStub,
    });
    await svc.alterarStatus(1, "em_rota");
    const [id, status, extras] = updateStatusStub.mock.calls[0];
    expect(id).toBe(1);
    expect(status).toBe("em_rota");
    expect(extras.iniciada_em).toBeInstanceOf(Date);
  });

  test("alterarStatus: em_rota -> finalizada calcula tempo_total_minutos e respeita km_real", async () => {
    const updateStatusStub = jest.fn().mockResolvedValue(1);
    const iniciada = new Date(Date.now() - 90 * 60 * 1000); // 90min atras
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "em_rota", motorista_id: 5, total_paradas: 3, iniciada_em: iniciada },
      updateStatusStub,
    });
    await svc.alterarStatus(1, "finalizada", { km_real: 87.5 });
    const [, , extras] = updateStatusStub.mock.calls[0];
    expect(extras.finalizada_em).toBeInstanceOf(Date);
    expect(extras.tempo_total_minutos).toBeGreaterThanOrEqual(89);
    expect(extras.tempo_total_minutos).toBeLessThanOrEqual(91);
    expect(extras.km_real).toBe(87.5);
  });

  test("alterarStatus: finalizada e' terminal — qualquer transicao falha", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "finalizada", motorista_id: 5 },
    });
    await expect(svc.alterarStatus(1, "em_rota")).rejects.toMatchObject({
      status: 409,
    });
  });

  // ---------------------------------------------------------------------------
  // Bloqueio em em_rota
  // ---------------------------------------------------------------------------

  test("atualizarRota: bloqueia em em_rota", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "em_rota", motorista_id: 5 },
    });
    await expect(svc.atualizarRota(1, { veiculo: "Outro" })).rejects.toMatchObject({
      status: 409,
    });
  });

  test("adicionarPedido: bloqueia em em_rota", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "em_rota", motorista_id: 5 },
    });
    await expect(svc.adicionarPedido(1, 100)).rejects.toMatchObject({
      status: 409,
    });
  });

  test("removerPedido: bloqueia em em_rota", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "em_rota", motorista_id: 5 },
    });
    await expect(svc.removerPedido(1, 100)).rejects.toMatchObject({
      status: 409,
    });
  });

  test("reordenarParadas: bloqueia em em_rota", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "em_rota", motorista_id: 5 },
    });
    await expect(
      svc.reordenarParadas(1, [{ pedido_id: 100, ordem: 1 }]),
    ).rejects.toMatchObject({ status: 409 });
  });

  // ---------------------------------------------------------------------------
  // Anti-dup
  // ---------------------------------------------------------------------------

  test("adicionarPedido: rejeita se ja' esta em OUTRA rota ativa", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 5 },
      paradaActiveStub: { id: 50, rota_id: 7, rota_status: "pronta" },
    });
    await expect(svc.adicionarPedido(1, 100)).rejects.toMatchObject({
      status: 409,
    });
  });

  test("adicionarPedido: idempotente — ja' esta na MESMA rota", async () => {
    const sameParada = { id: 99, rota_id: 1, pedido_id: 100, ordem: 1, status: "pendente" };
    const createParadaStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 5 },
      paradaActiveStub: { id: 99, rota_id: 1, rota_status: "rascunho" },
      paradaSameStub: sameParada,
      createParadaStub,
    });
    const r = await svc.adicionarPedido(1, 100);
    expect(r).toEqual(sameParada);
    expect(createParadaStub).not.toHaveBeenCalled();
  });

  test("adicionarPedido: rejeita pedido nao-pago", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 5 },
      pedidoStub: { status_pagamento: "pendente" },
    });
    await expect(svc.adicionarPedido(1, 100)).rejects.toMatchObject({
      status: 409,
    });
  });

  test("adicionarPedido: happy path cria parada + recalc", async () => {
    const createParadaStub = jest.fn().mockResolvedValue(99);
    const recalcStub = jest.fn().mockResolvedValue();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 5 },
      createParadaStub,
      recalcStub,
    });
    await svc.adicionarPedido(1, 100);
    expect(createParadaStub).toHaveBeenCalled();
    expect(recalcStub).toHaveBeenCalledWith(1, expect.anything());
  });

  // ---------------------------------------------------------------------------
  // reordenarParadas: validacoes
  // ---------------------------------------------------------------------------

  test("reordenarParadas: rejeita lista vazia", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 5 },
    });
    await expect(svc.reordenarParadas(1, [])).rejects.toMatchObject({ status: 400 });
  });

  test("reordenarParadas: rejeita ordem duplicada", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 5 },
    });
    await expect(
      svc.reordenarParadas(1, [
        { pedido_id: 100, ordem: 1 },
        { pedido_id: 200, ordem: 1 },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  // ---------------------------------------------------------------------------
  // Auto-envio de magic-link ao motorista (rascunho -> pronta)
  // ---------------------------------------------------------------------------

  test("alterarStatus -> pronta dispara requestMagicLink({motoristaId}) por default", async () => {
    const requestMagicLinkStub = jest.fn().mockResolvedValue({
      whatsapp: { status: "ok" },
    });
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();
    expect(requestMagicLinkStub).toHaveBeenCalledTimes(1);
    expect(requestMagicLinkStub).toHaveBeenCalledWith({ motoristaId: 7 });
  });

  test("alterarStatus -> pronta sem motorista NAO dispara magic-link", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: null, total_paradas: 2 },
      requestMagicLinkStub,
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();
    expect(requestMagicLinkStub).not.toHaveBeenCalled();
  });

  test("alterarStatus pronta -> em_rota NAO re-envia magic-link", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
    });
    await svc.alterarStatus(1, "em_rota");
    await flushMicrotasks();
    expect(requestMagicLinkStub).not.toHaveBeenCalled();
  });

  test("alterarStatus -> pronta com env=false NAO dispara", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      autoSendEnv: "false",
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();
    expect(requestMagicLinkStub).not.toHaveBeenCalled();
  });

  test("alterarStatus -> pronta nao falha quando requestMagicLink rejeita", async () => {
    const requestMagicLinkStub = jest
      .fn()
      .mockRejectedValue(new Error("WhatsApp down"));
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
    });
    // Nao deve lancar — fire-and-forget com .catch
    await expect(svc.alterarStatus(1, "pronta")).resolves.toBeDefined();
    await flushMicrotasks();
    expect(requestMagicLinkStub).toHaveBeenCalled();
  });

  test("atualizarRota: troca de motorista numa rota PRONTA dispara magic-link", async () => {
    const requestMagicLinkStub = jest.fn().mockResolvedValue({ whatsapp: { status: "ok" } });
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 7, total_paradas: 2 },
      motoristaStub: { id: 9, ativo: 1, nome: "novo" },
      requestMagicLinkStub,
    });
    await svc.atualizarRota(1, { motorista_id: 9 });
    await flushMicrotasks();
    expect(requestMagicLinkStub).toHaveBeenCalledWith({ motoristaId: 9 });
  });

  test("atualizarRota: troca de motorista em RASCUNHO NAO dispara (admin ainda editando)", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 0 },
      motoristaStub: { id: 9, ativo: 1, nome: "novo" },
      requestMagicLinkStub,
    });
    await svc.atualizarRota(1, { motorista_id: 9 });
    await flushMicrotasks();
    expect(requestMagicLinkStub).not.toHaveBeenCalled();
  });

  test("atualizarRota: mesmo motorista_id (no-op) NAO dispara", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 7, total_paradas: 2 },
      motoristaStub: { id: 7, ativo: 1, nome: "mesmo" },
      requestMagicLinkStub,
    });
    await svc.atualizarRota(1, { motorista_id: 7, veiculo: "Outro" });
    await flushMicrotasks();
    expect(requestMagicLinkStub).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Auto-envio: provider awareness (Etapa 2 da correcao)
  // ---------------------------------------------------------------------------

  test("auto-send em provider=manual: dispara mas loga warn explicito (mensagem nao entregue)", async () => {
    const requestMagicLinkStub = jest.fn().mockResolvedValue({
      whatsapp: { provider: "manual", status: "manual_pending" },
      delivered: false,
    });
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "manual"),
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();

    expect(requestMagicLinkStub).toHaveBeenCalledTimes(1);
    expect(svc._loggerStub.info).toHaveBeenCalledWith(
      expect.objectContaining({
        rotaId: 1,
        motoristaId: 7,
        provider: "manual",
        delivered: false,
      }),
      "rotas.auto_magic_link.sent",
    );
    expect(svc._loggerStub.warn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "manual" }),
      "rotas.auto_magic_link.manual_pending_action_required",
    );
  });

  test("auto-send em provider=api com delivered=true: SO log info, sem warn", async () => {
    const requestMagicLinkStub = jest.fn().mockResolvedValue({
      whatsapp: { provider: "api", status: "sent" },
      delivered: true,
    });
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "api"),
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();

    expect(svc._loggerStub.info).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "api", delivered: true }),
      "rotas.auto_magic_link.sent",
    );
    expect(svc._loggerStub.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "rotas.auto_magic_link.manual_pending_action_required",
    );
  });

  test("auto-send com REQUIRES_API=true e provider=manual: PULA + loga skipped", async () => {
    const requestMagicLinkStub = jest.fn();
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "manual"),
      requiresApiEnv: "true",
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();

    expect(requestMagicLinkStub).not.toHaveBeenCalled();
    expect(svc._loggerStub.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rotaId: 1, motoristaId: 7, provider: "manual" }),
      "rotas.auto_magic_link.skipped_provider_manual",
    );
  });

  test("auto-send com REQUIRES_API=true e provider=api: dispara normal", async () => {
    const requestMagicLinkStub = jest.fn().mockResolvedValue({
      whatsapp: { provider: "api", status: "sent" },
      delivered: true,
    });
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "api"),
      requiresApiEnv: "true",
    });
    await svc.alterarStatus(1, "pronta");
    await flushMicrotasks();
    expect(requestMagicLinkStub).toHaveBeenCalledWith({ motoristaId: 7 });
  });

  // ---------------------------------------------------------------------------
  // drainInFlight: protege logs em SIGTERM (Etapa 3)
  // ---------------------------------------------------------------------------

  test("drainInFlight: retorna imediato quando nao ha envios em curso", async () => {
    const svc = loadWithMocks({});
    await expect(svc.drainInFlight(1000)).resolves.toBeUndefined();
  });

  test("drainInFlight: aguarda envio em curso completar antes de resolver", async () => {
    let resolveSend;
    const requestMagicLinkStub = jest.fn(
      () =>
        new Promise((res) => {
          resolveSend = () =>
            res({
              whatsapp: { provider: "api", status: "sent" },
              delivered: true,
            });
        }),
    );
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "api"),
    });
    await svc.alterarStatus(1, "pronta");

    let drained = false;
    const drainPromise = svc.drainInFlight(2000).then(() => {
      drained = true;
    });

    // Sem o resolve, drain ainda nao completou
    await new Promise((r) => setImmediate(r));
    expect(drained).toBe(false);

    resolveSend();
    await drainPromise;
    expect(drained).toBe(true);

    // Logs sucesso registrado depois do drain
    expect(svc._loggerStub.info).toHaveBeenCalledWith(
      expect.objectContaining({ rotaId: 1, motoristaId: 7 }),
      "rotas.auto_magic_link.sent",
    );
  });

  test("drainInFlight: respeita timeout quando envio trava", async () => {
    const requestMagicLinkStub = jest.fn(
      () => new Promise(() => { /* nunca resolve */ }),
    );
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "rascunho", motorista_id: 7, total_paradas: 2 },
      requestMagicLinkStub,
      whatsappProviderStub: jest.fn(() => "api"),
    });
    await svc.alterarStatus(1, "pronta");
    await new Promise((r) => setImmediate(r));

    const start = Date.now();
    await svc.drainInFlight(60); // 60ms timeout
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500); // nao trava 5s default
    expect(svc._loggerStub.info).toHaveBeenCalledWith(
      expect.objectContaining({ result: "timeout" }),
      "rotas.auto_magic_link.drain",
    );
  });

  // ---------------------------------------------------------------------------
  // listarPedidosDisponiveis — Bug 2: filtra pedidos ja' entregues/cancelados
  // ---------------------------------------------------------------------------

  test("listarPedidosDisponiveis: SQL filtra status_entrega NOT IN ('entregue','cancelado')", async () => {
    const poolQueryStub = jest.fn().mockResolvedValue([[], []]);
    const svc = loadWithMocks({ poolQueryStub });
    await svc.listarPedidosDisponiveis({});
    expect(poolQueryStub).toHaveBeenCalled();
    const sql = poolQueryStub.mock.calls[0][0];
    expect(sql).toMatch(/p\.status_pagamento\s*=\s*'pago'/);
    expect(sql).toMatch(
      /p\.status_entrega\s+NOT IN\s*\(\s*'entregue'\s*,\s*'cancelado'\s*\)/,
    );
  });

  // ---------------------------------------------------------------------------
  // deletarRota
  // ---------------------------------------------------------------------------

  test("deletarRota: so' rascunho", async () => {
    const svc = loadWithMocks({
      rotaStub: { id: 1, status: "pronta", motorista_id: 5 },
    });
    await expect(svc.deletarRota(1)).rejects.toMatchObject({ status: 409 });
  });
});
