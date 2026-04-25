/**
 * test/unit/services/trialReminderService.unit.test.js
 *
 * G4 — auto-downgrade no bucket "expired". Cobre:
 *   - downgrade desabilitado por padrao (TRIAL_AUTO_DOWNGRADE_ENABLED=false)
 *   - margem de seguranca: skip se trial_ends_at dentro de grace
 *   - idempotencia: skip se ja existe trial_expired_downgrade
 *   - happy path: downgrade -> email -> notif painel
 *   - downgrade falha -> NAO envia email (estado real ainda e' trialing)
 *   - cancelPlan retorna already_free -> loga evento mas marca como
 *     skipped_already_free
 *   - dedup notif via existsTodayByType
 *   - buckets d7/d3/d1 NUNCA tentam downgrade
 */

"use strict";

describe("services/trialReminderService — G4 auto-downgrade", () => {
  const originalEnv = process.env;

  function loadWithMocks(opts = {}) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      TRIAL_AUTO_DOWNGRADE_ENABLED: opts.enabled ?? "false",
      TRIAL_AUTO_DOWNGRADE_GRACE_HOURS: opts.graceHours ?? "1",
    };

    const subsList = opts.subsList ?? jest.fn().mockResolvedValue([]);
    const hasEventWithBucket =
      opts.hasEventWithBucket ?? jest.fn().mockResolvedValue(false);
    const hasEventOfType =
      opts.hasEventOfType ?? jest.fn().mockResolvedValue(false);
    const eventCreate = opts.eventCreate ?? jest.fn().mockResolvedValue(1);
    const cancelPlan =
      opts.cancelPlan ??
      jest
        .fn()
        .mockResolvedValue({ newSubId: 999, newPlan: { id: 1, slug: "free" } });
    const sendCorretoraTrialEndingEmail =
      opts.sendCorretoraTrialEndingEmail ??
      jest.fn().mockResolvedValue({ sent: 1 });
    const notifCreate = opts.notifCreate ?? jest.fn().mockResolvedValue(1);
    const existsTodayByType =
      opts.existsTodayByType ?? jest.fn().mockResolvedValue(false);
    const listTeamByCorretoraId =
      opts.listTeamByCorretoraId ?? jest.fn().mockResolvedValue([]);

    jest.doMock(
      require.resolve("../../../repositories/subscriptionsRepository"),
      () => ({ listTrialsEndingOn: subsList }),
    );
    jest.doMock(
      require.resolve("../../../repositories/subscriptionEventsRepository"),
      () => ({
        hasEventWithBucket,
        hasEventOfType,
        create: eventCreate,
      }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraUsersRepository"),
      () => ({ listTeamByCorretoraId }),
    );
    jest.doMock(
      require.resolve("../../../repositories/corretoraNotificationsRepository"),
      () => ({ create: notifCreate, existsTodayByType }),
    );
    jest.doMock(require.resolve("../../../services/planService"), () => ({
      cancelPlan,
    }));
    jest.doMock(require.resolve("../../../services/mailService"), () => ({
      sendCorretoraTrialEndingEmail,
    }));
    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const svc = require("../../../services/trialReminderService");
    return {
      svc,
      subsList,
      hasEventWithBucket,
      hasEventOfType,
      eventCreate,
      cancelPlan,
      sendCorretoraTrialEndingEmail,
      notifCreate,
      existsTodayByType,
    };
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  function expiredSub(overrides = {}) {
    return {
      id: 100,
      corretora_id: 7,
      plan_id: 2,
      corretora_email: "owner@example.com",
      corretora_name: "Corretora Teste",
      // Trial expirou ha 5h (alem do grace de 1h)
      trial_ends_at: new Date(Date.now() - 5 * 3600 * 1000),
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // Master switch
  // ---------------------------------------------------------------------------

  test("master switch OFF: NAO chama cancelPlan, mas envia email legado (preserva comportamento pre-G4)", async () => {
    const { svc, cancelPlan, sendCorretoraTrialEndingEmail, notifCreate } =
      loadWithMocks({
        enabled: "false",
        subsList: jest.fn(async (days) => (days === 0 ? [expiredSub()] : [])),
      });

    const r = await svc.runOnce();
    expect(cancelPlan).not.toHaveBeenCalled();
    // Notif painel SO' apos downgrade — sem switch, sem notif
    expect(notifCreate).not.toHaveBeenCalled();
    // Email expired CONTINUA sendo enviado (legacy) com autoDowngraded=false
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendCorretoraTrialEndingEmail.mock.calls[0][0];
    expect(emailArgs.autoDowngraded).toBe(false);
    expect(r.auto_downgrade_enabled).toBe(false);
    expect(r.downgraded).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Margem de seguranca
  // ---------------------------------------------------------------------------

  test("dentro do grace: skip downgrade, mas envia email legado (autoDowngraded=false)", async () => {
    const subs = [
      expiredSub({
        // trial expirou 30min atras (dentro do grace de 1h)
        trial_ends_at: new Date(Date.now() - 30 * 60 * 1000),
      }),
    ];
    const { svc, cancelPlan, sendCorretoraTrialEndingEmail, notifCreate } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
    });
    const r = await svc.runOnce();
    expect(cancelPlan).not.toHaveBeenCalled();
    // Email vai com copy legado (sem mencionar FREE ativado)
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendCorretoraTrialEndingEmail.mock.calls[0][0];
    expect(emailArgs.autoDowngraded).toBe(false);
    // Notif painel SO' apos downgrade efetivo — dentro do grace nao notifica
    expect(notifCreate).not.toHaveBeenCalled();
    expect(r.downgrade_skipped_grace).toBe(1);
    expect(r.downgraded).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Idempotencia
  // ---------------------------------------------------------------------------

  test("ja existe trial_expired_downgrade: skip cancelPlan, email sem flag de downgrade", async () => {
    const subs = [expiredSub()];
    const cancelPlan = jest.fn();
    const { svc, sendCorretoraTrialEndingEmail } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
      hasEventOfType: jest.fn().mockResolvedValue(true),
      cancelPlan,
    });
    const r = await svc.runOnce();
    expect(cancelPlan).not.toHaveBeenCalled();
    expect(r.downgrade_skipped_idempotent).toBe(1);
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    // Idempotente -> autoDowngraded=false (nao foi rebaixada nesta rodada)
    expect(sendCorretoraTrialEndingEmail.mock.calls[0][0].autoDowngraded).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  test("happy path: downgrade -> email (autoDowngraded=true) -> notif painel", async () => {
    const subs = [expiredSub()];
    const cancelPlan = jest
      .fn()
      .mockResolvedValue({ newSubId: 555, newPlan: { id: 1, slug: "free" } });
    const eventCreate = jest.fn().mockResolvedValue(42);
    const notifCreate = jest.fn().mockResolvedValue(11);
    const sendCorretoraTrialEndingEmail = jest.fn().mockResolvedValue({ sent: 1 });

    const { svc, cancelPlan: cp } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
      cancelPlan,
      eventCreate,
      notifCreate,
      sendCorretoraTrialEndingEmail,
    });

    const r = await svc.runOnce();

    expect(cp).toHaveBeenCalledWith({
      corretoraId: 7,
      opts: expect.objectContaining({
        actor_type: "system",
        reason: "trial_expired_auto_downgrade",
        source: "trial_reminder_job",
        targetPlanSlug: "free",
      }),
    });
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendCorretoraTrialEndingEmail.mock.calls[0][0];
    expect(emailArgs.autoDowngraded).toBe(true);

    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        corretora_id: 7,
        type: "trial_expired",
        title: expect.stringMatching(/FREE ativado/),
        link: "/painel/corretora/planos",
      }),
    );

    // 2 eventos: o trial_expired_downgrade + o trial.reminder_sent
    const eventTypes = eventCreate.mock.calls.map((c) => c[0].event_type);
    expect(eventTypes).toContain("trial_expired_downgrade");
    expect(eventTypes).toContain("trial.reminder_sent");

    expect(r.downgraded).toBe(1);
    expect(r.panel_notif_sent).toBe(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Falha de downgrade -> NAO envia email
  // ---------------------------------------------------------------------------

  test("cancelPlan throw: NAO envia email, NAO cria notif", async () => {
    const subs = [expiredSub()];
    const cancelPlan = jest
      .fn()
      .mockRejectedValue(new Error("DB foi pra ferias"));
    const sendCorretoraTrialEndingEmail = jest.fn();
    const notifCreate = jest.fn();

    const { svc } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
      cancelPlan,
      sendCorretoraTrialEndingEmail,
      notifCreate,
    });

    const r = await svc.runOnce();
    expect(cancelPlan).toHaveBeenCalledTimes(1);
    expect(sendCorretoraTrialEndingEmail).not.toHaveBeenCalled();
    expect(notifCreate).not.toHaveBeenCalled();
    expect(r.downgrade_failed).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // already_free
  // ---------------------------------------------------------------------------

  test("cancelPlan ja' free: registra evento informativo, envia email + notif", async () => {
    const subs = [expiredSub()];
    const cancelPlan = jest.fn().mockResolvedValue({ already_free: true });
    const eventCreate = jest.fn().mockResolvedValue(1);
    const notifCreate = jest.fn().mockResolvedValue(1);

    const { svc, sendCorretoraTrialEndingEmail } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
      cancelPlan,
      eventCreate,
      notifCreate,
    });

    const r = await svc.runOnce();
    expect(r.downgrade_already_free).toBe(1);
    expect(r.downgraded).toBe(0);
    // Mesmo "ja' free", email e notif vao — significa que trial encerrou
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    expect(notifCreate).toHaveBeenCalledTimes(1);
    // Evento informativo gravado
    const eventTypes = eventCreate.mock.calls.map((c) => c[0].event_type);
    expect(eventTypes).toContain("trial_expired_downgrade");
  });

  // ---------------------------------------------------------------------------
  // Notif dedup
  // ---------------------------------------------------------------------------

  test("notif painel dup hoje: skip notif, mantem email", async () => {
    const subs = [expiredSub()];
    const cancelPlan = jest.fn().mockResolvedValue({
      newSubId: 555,
      newPlan: { id: 1, slug: "free" },
    });
    const existsTodayByType = jest.fn().mockResolvedValue(true);
    const notifCreate = jest.fn();

    const { svc, sendCorretoraTrialEndingEmail } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => (days === 0 ? subs : [])),
      cancelPlan,
      existsTodayByType,
      notifCreate,
    });

    const r = await svc.runOnce();
    expect(notifCreate).not.toHaveBeenCalled();
    expect(sendCorretoraTrialEndingEmail).toHaveBeenCalledTimes(1);
    expect(r.panel_notif_skipped_duplicate).toBe(1);
    expect(r.panel_notif_sent).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // d7/d3/d1 NAO tentam downgrade
  // ---------------------------------------------------------------------------

  test("buckets d7/d3/d1: NUNCA chamam cancelPlan", async () => {
    const sub7 = { ...expiredSub({ id: 1 }), trial_ends_at: new Date(Date.now() + 7 * 86400000) };
    const sub3 = { ...expiredSub({ id: 2 }), trial_ends_at: new Date(Date.now() + 3 * 86400000) };
    const sub1 = { ...expiredSub({ id: 3 }), trial_ends_at: new Date(Date.now() + 1 * 86400000) };

    const cancelPlan = jest.fn();
    const { svc } = loadWithMocks({
      enabled: "true",
      subsList: jest.fn(async (days) => {
        if (days === 7) return [sub7];
        if (days === 3) return [sub3];
        if (days === 1) return [sub1];
        return [];
      }),
      cancelPlan,
    });

    await svc.runOnce();
    expect(cancelPlan).not.toHaveBeenCalled();
  });
});
