// test/unit/services/contratoServiceGuards.unit.test.js
//
// Cobre os guards de KYC + plano + capability na criação e no envio
// de contrato (Fase 10.3). Mocka repos/services para não tocar em
// Puppeteer, Handlebars, banco ou disco — o foco é a regra de
// negócio: corretora só gera contrato se está verificada, com
// subscription ativa e capability create_contract no plano.
"use strict";

describe("contratoService — guards de KYC + plano + capability", () => {
  // Helpers compartilhados para construir as fixtures rapidamente.
  function buildLead(overrides = {}) {
    return {
      id: 10,
      corretora_id: 1,
      status: "closed",
      nome: "Produtor X",
      telefone: "31988887777",
      email: null,
      cidade: "Manhuaçu",
      ...overrides,
    };
  }

  function buildCorretora(overrides = {}) {
    return {
      id: 1,
      name: "Corretora Y",
      cnpj: null,
      kyc_status: "verified",
      ...overrides,
    };
  }

  function buildPlanContext(overrides = {}) {
    return {
      subscription: { id: 99, status: "active", trial_ends_at: null },
      plan: { slug: "pro", name: "Pro", price_cents: 14900 },
      capabilities: { create_contract: true },
      status: "active",
      ...overrides,
    };
  }

  // Carrega o service com mocks injetados — replica o padrão usado
  // em test/unit/services/trialReminderService.unit.test.js.
  function loadServiceWithMocks(mocks = {}) {
    jest.resetModules();

    const leadsRepo = mocks.leadsRepo ?? {
      findByIdForCorretora: jest.fn().mockResolvedValue(buildLead()),
    };
    const corretorasRepo = mocks.corretorasRepo ?? {
      findById: jest.fn().mockResolvedValue(buildCorretora()),
    };
    const contratoRepo = mocks.contratoRepo ?? {
      hasActiveForLead: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue(1234),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };
    const planService = mocks.planService ?? {
      requireActivePlanWithCapability: jest
        .fn()
        .mockResolvedValue(buildPlanContext()),
    };
    const leadEventsRepo = mocks.leadEventsRepo ?? {
      create: jest.fn().mockResolvedValue(1),
    };

    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadsRepository"),
      () => leadsRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/corretorasPublicRepository"),
      () => corretorasRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/contratoRepository"),
      () => contratoRepo,
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraLeadEventsRepository"),
      () => leadEventsRepo,
    );
    jest.doMock(
      require.resolve("../../../services/planService"),
      () => planService,
    );

    // Faz o caminho positivo curto-circuitar antes de Puppeteer:
    // mocamos `_renderHtml` indiretamente via mock do template loader
    // não é viável; ao invés disso, deixamos a chamada falhar em
    // Puppeteer no caminho positivo do teste e validamos só que ela
    // chega ALÉM dos guards (sem AppError 403). Para isso o teste
    // positivo só checa que requireActivePlanWithCapability foi
    // chamado e não jogou — não roda gerarContrato até o final.

    // eslint-disable-next-line global-require
    return require("../../../services/contratoService");
  }

  // ─── KYC ────────────────────────────────────────────────────────────────────

  it("bloqueia quando corretora.kyc_status === 'pending_verification'", async () => {
    const service = loadServiceWithMocks({
      corretorasRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildCorretora({ kyc_status: "pending_verification" })),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/KYC/i),
    });
  });

  it("bloqueia quando corretora.kyc_status === 'rejected'", async () => {
    const service = loadServiceWithMocks({
      corretorasRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildCorretora({ kyc_status: "rejected" })),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/KYC/i),
    });
  });

  // ─── Subscription status ───────────────────────────────────────────────────

  it("bloqueia quando subscription.status === 'canceled'", async () => {
    // requireActivePlanWithCapability é o ponto único onde a regra é
    // aplicada — mocamos ele jogando o erro real que o helper jogaria.
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const service = loadServiceWithMocks({
      planService: {
        requireActivePlanWithCapability: jest.fn().mockRejectedValue(
          new AppError(
            "Plano inativo. Regularize sua assinatura para gerar contratos.",
            ERROR_CODES.PLAN_INACTIVE,
            403,
            { subscription_status: "canceled", current_plan: "pro" },
          ),
        ),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "PLAN_INACTIVE",
      message: expect.stringMatching(/Plano inativo/i),
    });
  });

  it("bloqueia quando subscription.status === 'expired'", async () => {
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const service = loadServiceWithMocks({
      planService: {
        requireActivePlanWithCapability: jest.fn().mockRejectedValue(
          new AppError(
            "Plano inativo. Regularize sua assinatura para gerar contratos.",
            ERROR_CODES.PLAN_INACTIVE,
            403,
            { subscription_status: "expired", current_plan: "pro" },
          ),
        ),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "PLAN_INACTIVE",
    });
  });

  // ─── Capability ────────────────────────────────────────────────────────────

  it("bloqueia quando plano não tem create_contract", async () => {
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");
    const service = loadServiceWithMocks({
      planService: {
        requireActivePlanWithCapability: jest.fn().mockRejectedValue(
          new AppError(
            "Seu plano atual não permite geração de contratos.",
            ERROR_CODES.PLAN_CAPABILITY_REQUIRED,
            403,
            { capability: "create_contract", current_plan: "free" },
          ),
        ),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "PLAN_CAPABILITY_REQUIRED",
      message: expect.stringMatching(/não permite/i),
    });
  });

  // ─── Caminho positivo ──────────────────────────────────────────────────────

  it("chama requireActivePlanWithCapability quando KYC verified", async () => {
    // No caminho positivo, gerarContrato continua até Puppeteer/render
    // — não é interesse desta suite ir até lá. Validamos apenas que
    // os guards foram exercitados na ordem certa: KYC primeiro,
    // depois plano. Falhamos a chamada DEPOIS do guard de plano para
    // não tocar em Puppeteer.
    const requireActive = jest.fn().mockResolvedValue(buildPlanContext());
    const service = loadServiceWithMocks({
      planService: { requireActivePlanWithCapability: requireActive },
      // Faz o parseDataFieldsByTipo falhar com erro de validação
      // (400) — qualquer erro depois dos guards serve para encerrar
      // o fluxo sem pagar Puppeteer. Erro de schema é o mais barato.
    });
    await expect(
      service.gerarContrato({
        leadId: 10,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {}, // payload vazio → falha no parse, depois dos guards
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(requireActive).toHaveBeenCalledWith(1, "create_contract");
  });

  // ─── Tenant isolation (existente — só sanidade) ────────────────────────────

  it("bloqueia quando lead pertence a outra corretora (lead não encontrado)", async () => {
    const service = loadServiceWithMocks({
      leadsRepo: {
        findByIdForCorretora: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(
      service.gerarContrato({
        leadId: 999,
        corretoraId: 1,
        tipo: "disponivel",
        dataFields: {},
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
