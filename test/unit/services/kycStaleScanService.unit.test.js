/**
 * test/unit/services/kycStaleScanService.unit.test.js
 *
 * G5 — alerta de KYC parado. Cobre:
 *   - list() separa pending_verification e under_review
 *   - thresholds via opts ou env (com defaults)
 *   - runOnce() insere nota com category='kyc_stale_alert'
 *   - dedupe via hasNoteTodayByCategory
 *   - falha em uma corretora nao quebra as proximas
 *   - body humanizado por status
 */

"use strict";

describe("services/kycStaleScanService", () => {
  const originalEnv = process.env;

  function loadWithMocks({ envOverrides = {}, repoStubs = {}, notesStubs = {} } = {}) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ...envOverrides,
    };

    const findStaleByStatus =
      repoStubs.findStaleByStatus ?? jest.fn().mockResolvedValue([]);
    const hasNoteTodayByCategory =
      notesStubs.hasNoteTodayByCategory ?? jest.fn().mockResolvedValue(false);
    const create = notesStubs.create ?? jest.fn().mockResolvedValue(1);

    jest.doMock(
      require.resolve("../../../repositories/corretoraKycRepository"),
      () => ({ findStaleByStatus }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraAdminNotesRepository"),
      () => ({
        hasNoteTodayByCategory,
        create,
        listForCorretora: jest.fn(),
        deleteById: jest.fn(),
      }),
    );
    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const svc = require("../../../services/kycStaleScanService");
    return { svc, findStaleByStatus, hasNoteTodayByCategory, create };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------

  test("list: chama o repo 2x com status corretos e thresholds default", async () => {
    const { svc, findStaleByStatus } = loadWithMocks();
    const r = await svc.list();

    expect(findStaleByStatus).toHaveBeenCalledTimes(2);
    expect(findStaleByStatus).toHaveBeenCalledWith({
      status: "pending_verification",
      olderThanDays: 7,
    });
    expect(findStaleByStatus).toHaveBeenCalledWith({
      status: "under_review",
      olderThanDays: 3,
    });
    expect(r.thresholds).toEqual({ pendingDays: 7, reviewDays: 3 });
  });

  test("list: env vars sobrescrevem defaults", async () => {
    const { svc, findStaleByStatus } = loadWithMocks({
      envOverrides: { KYC_STALE_PENDING_DAYS: "14", KYC_STALE_REVIEW_DAYS: "5" },
    });
    const r = await svc.list();
    expect(r.thresholds).toEqual({ pendingDays: 14, reviewDays: 5 });
    expect(findStaleByStatus).toHaveBeenCalledWith({
      status: "pending_verification",
      olderThanDays: 14,
    });
  });

  test("list: opts sobrescrevem env e default", async () => {
    const { svc } = loadWithMocks({
      envOverrides: { KYC_STALE_PENDING_DAYS: "14" },
    });
    const r = await svc.list({ pendingDays: 30, reviewDays: 10 });
    expect(r.thresholds).toEqual({ pendingDays: 30, reviewDays: 10 });
  });

  test("list: separa pending e underReview corretamente", async () => {
    const { svc } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) => {
          if (status === "pending_verification") {
            return [{ corretora_id: 1, nome: "Pen", kyc_status: "pending_verification", age_days: 10 }];
          }
          return [
            { corretora_id: 2, nome: "Rev1", kyc_status: "under_review", age_days: 4 },
            { corretora_id: 3, nome: "Rev2", kyc_status: "under_review", age_days: 5 },
          ];
        }),
      },
    });

    const r = await svc.list();
    expect(r.pending).toHaveLength(1);
    expect(r.underReview).toHaveLength(2);
    expect(r.pending[0].corretora_id).toBe(1);
    expect(r.underReview.map((x) => x.corretora_id)).toEqual([2, 3]);
  });

  // ---------------------------------------------------------------------------
  // runOnce()
  // ---------------------------------------------------------------------------

  test("runOnce: nenhuma corretora stale -> notified=0, total=0", async () => {
    const { svc, create } = loadWithMocks();
    const report = await svc.runOnce();
    expect(report).toEqual({
      pending_count: 0,
      review_count: 0,
      total_stale: 0,
      notified: 0,
      skipped_duplicate: 0,
      thresholds: { pendingDays: 7, reviewDays: 3 },
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("runOnce: cria 1 nota por corretora stale, com category=kyc_stale_alert", async () => {
    const { svc, create } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) =>
          status === "pending_verification"
            ? [{ corretora_id: 10, nome: "X", kyc_status: "pending_verification", age_days: 9 }]
            : [{ corretora_id: 20, nome: "Y", kyc_status: "under_review", age_days: 4 }],
        ),
      },
    });
    const report = await svc.runOnce();

    expect(report.pending_count).toBe(1);
    expect(report.review_count).toBe(1);
    expect(report.total_stale).toBe(2);
    expect(report.notified).toBe(2);

    expect(create).toHaveBeenCalledTimes(2);
    const calls = create.mock.calls.map((c) => c[0]);
    expect(calls.every((c) => c.category === "kyc_stale_alert")).toBe(true);
    expect(calls.every((c) => c.admin_id === null)).toBe(true);
    expect(calls.every((c) => c.admin_nome === "sistema")).toBe(true);
  });

  test("runOnce: dedupe — pula corretora que ja tem nota hoje", async () => {
    const hasNoteSpy = jest
      .fn()
      .mockResolvedValueOnce(true) // primeira ja foi alertada
      .mockResolvedValueOnce(false); // segunda passa

    const { svc, create } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) =>
          status === "pending_verification"
            ? [
                { corretora_id: 1, nome: "A", kyc_status: "pending_verification", age_days: 9 },
                { corretora_id: 2, nome: "B", kyc_status: "pending_verification", age_days: 8 },
              ]
            : [],
        ),
      },
      notesStubs: { hasNoteTodayByCategory: hasNoteSpy },
    });

    const report = await svc.runOnce();
    expect(report.skipped_duplicate).toBe(1);
    expect(report.notified).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].corretora_id).toBe(2);
  });

  test("runOnce: body para pending menciona contato proativo", async () => {
    const { svc, create } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) =>
          status === "pending_verification"
            ? [{ corretora_id: 7, nome: "Z", kyc_status: "pending_verification", age_days: 12 }]
            : [],
        ),
      },
    });
    await svc.runOnce();
    const body = create.mock.calls[0][0].body;
    expect(body).toMatch(/pending_verification/);
    expect(body).toMatch(/12 dias/);
    expect(body).toMatch(/contato proativo/i);
  });

  test("runOnce: body para under_review menciona aprovacao do admin", async () => {
    const { svc, create } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) =>
          status === "under_review"
            ? [{ corretora_id: 7, nome: "Z", kyc_status: "under_review", age_days: 1 }]
            : [],
        ),
      },
    });
    await svc.runOnce();
    const body = create.mock.calls[0][0].body;
    expect(body).toMatch(/under_review/);
    expect(body).toMatch(/1 dia/);
    expect(body).toMatch(/aprovacao\/rejeicao do admin/i);
  });

  test("runOnce: falha em UMA corretora nao quebra as proximas", async () => {
    let callIdx = 0;
    const create = jest.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) throw new Error("DB timeout pra essa corretora");
      return 99;
    });

    const { svc } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async ({ status }) =>
          status === "pending_verification"
            ? [
                { corretora_id: 1, nome: "A", kyc_status: "pending_verification", age_days: 9 },
                { corretora_id: 2, nome: "B", kyc_status: "pending_verification", age_days: 8 },
              ]
            : [],
        ),
      },
      notesStubs: { create },
    });

    const report = await svc.runOnce();
    // primeira deu erro (entry_failed loga mas nao incrementa notified),
    // segunda passou
    expect(report.notified).toBe(1);
    expect(report.skipped_duplicate).toBe(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("runOnce: falha total no list -> retorna report zerado sem lancar", async () => {
    const { svc, create } = loadWithMocks({
      repoStubs: {
        findStaleByStatus: jest.fn(async () => {
          throw new Error("DB caiu");
        }),
      },
    });
    const report = await svc.runOnce();
    expect(report.total_stale).toBe(0);
    expect(report.notified).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  test("constants exposed are the documented defaults", () => {
    const { svc } = loadWithMocks();
    expect(svc.DEFAULT_PENDING_DAYS).toBe(7);
    expect(svc.DEFAULT_REVIEW_DAYS).toBe(3);
    expect(svc.ADMIN_NOTE_CATEGORY).toBe("kyc_stale_alert");
  });
});
