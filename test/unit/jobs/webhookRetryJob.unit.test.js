"use strict";

// Cobre B6 (Fase 1 go-live): reprocessamento de webhooks PARKED.

const mockPool = { query: jest.fn() };
jest.mock("../../../config/pool", () => mockPool);

const mockPaymentRepo = {
  findParkedPendingOrderMatch: jest.fn(),
};
jest.mock("../../../repositories/paymentRepository", () => mockPaymentRepo);

const mockHandle = jest.fn();
jest.mock("../../../services/paymentWebhookService", () => ({
  handleWebhookEvent: mockHandle,
}));

jest.mock("../../../lib/sentry", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock("../../../lib/logger", () => mockLogger);

const job = require("../../../jobs/webhookRetryJob");
const sentry = require("../../../lib/sentry");

describe("webhookRetryJob (B6 fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_RETRY_JOB_MAX_ATTEMPTS = "5";
    process.env.WEBHOOK_RETRY_JOB_BATCH = "10";
  });

  test("extractPedidoIdFromMarker parseia marker bem-formado", () => {
    const fn = job._internal.extractPedidoIdFromMarker;
    expect(fn("PARKED:PENDING_ORDER_MATCH:pedidoId=42")).toBe(42);
    expect(fn("PARKED:PENDING_ORDER_MATCH:pedidoId=42;extra=x")).toBe(42);
    expect(fn("IGNORED")).toBe(null);
    expect(fn(null)).toBe(null);
    expect(fn("PARKED:PENDING_ORDER_MATCH:pedidoId=abc")).toBe(null);
  });

  test("processa evento quando pedido aparece no banco", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([
      {
        id: 1,
        provider_event_id: "mp-123",
        event_type: "payment",
        payload: JSON.stringify({ _meta: { signature: "sig" }, body: { id: "mp-123" } }),
        processing_error: "PARKED:PENDING_ORDER_MATCH:pedidoId=99",
        retry_count: 1,
      },
    ]);
    // pedidoExists query → encontrou
    mockPool.query.mockResolvedValueOnce([[{ id: 99 }]]);
    mockHandle.mockResolvedValue("processed");

    await job.tick();
    const state = job.getState();

    expect(mockHandle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "mp-123",
        type: "payment",
        signatureHeader: "sig",
      }),
    );
    expect(state.lastReport.processed).toBe(1);
    expect(state.lastReport.exhausted).toBe(0);
  });

  test("pula evento quando pedido ainda não existe", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([
      {
        id: 2,
        provider_event_id: "mp-456",
        event_type: "payment",
        payload: "{}",
        processing_error: "PARKED:PENDING_ORDER_MATCH:pedidoId=100",
        retry_count: 0,
      },
    ]);
    // pedidoExists → vazio
    mockPool.query.mockResolvedValueOnce([[]]);

    await job.tick();
    const state = job.getState();

    expect(mockHandle).not.toHaveBeenCalled();
    expect(state.lastReport.stillParked).toBe(1);
    expect(state.lastReport.processed).toBe(0);
  });

  test("marca como EXHAUSTED após exceder max_attempts", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([
      {
        id: 3,
        provider_event_id: "mp-789",
        event_type: "payment",
        payload: "{}",
        processing_error: "PARKED:PENDING_ORDER_MATCH:pedidoId=101",
        retry_count: 5, // == maxAttempts
      },
    ]);
    // markExhausted faz UPDATE — mock query genérica
    mockPool.query.mockResolvedValue([{}]);

    await job.tick();
    const state = job.getState();

    expect(mockHandle).not.toHaveBeenCalled();
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("exhausted"),
      "error",
      expect.objectContaining({
        tags: expect.objectContaining({ domain: "payment.webhook.retry_exhausted" }),
      }),
    );
    expect(state.lastReport.exhausted).toBe(1);
  });

  test("marca como EXHAUSTED quando marker é malformado", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([
      {
        id: 4,
        provider_event_id: "mp-bad",
        event_type: "payment",
        payload: "{}",
        processing_error: "PARKED:UNKNOWN_FORMAT",
        retry_count: 0,
      },
    ]);
    mockPool.query.mockResolvedValue([{}]);

    await job.tick();
    const state = job.getState();

    expect(mockHandle).not.toHaveBeenCalled();
    expect(state.lastReport.exhausted).toBe(1);
  });

  test("contabiliza erro do handler sem derrubar o tick", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([
      {
        id: 5,
        provider_event_id: "mp-err",
        event_type: "payment",
        payload: "{}",
        processing_error: "PARKED:PENDING_ORDER_MATCH:pedidoId=200",
        retry_count: 1,
      },
    ]);
    // pedido existe
    mockPool.query.mockResolvedValueOnce([[{ id: 200 }]]);
    mockHandle.mockRejectedValue(new Error("boom"));

    await job.tick();
    const state = job.getState();

    expect(state.lastReport.errors).toBe(1);
    expect(state.lastStatus).toBe("success"); // tick-level success; per-event error counted
    expect(sentry.captureException).toHaveBeenCalled();
  });

  test("emite log webhook.retry.started com candidates count", async () => {
    mockPaymentRepo.findParkedPendingOrderMatch.mockResolvedValue([]);
    await job.tick();
    const state = job.getState();
    expect(state.lastStatus).toBe("success");
    expect(state.lastReport.scanned).toBe(0);
  });

  describe("register() warning de produção", () => {
    const ORIG_NODE_ENV = process.env.NODE_ENV;
    const ORIG_ENABLED = process.env.WEBHOOK_RETRY_JOB_ENABLED;

    afterEach(() => {
      // Para o timer que possa ter sido criado em testes que mudaram NODE_ENV
      job.stop();
      if (ORIG_NODE_ENV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = ORIG_NODE_ENV;
      if (ORIG_ENABLED === undefined) delete process.env.WEBHOOK_RETRY_JOB_ENABLED;
      else process.env.WEBHOOK_RETRY_JOB_ENABLED = ORIG_ENABLED;
    });

    test("em produção com job desligado → logger.error + sentry.captureMessage", async () => {
      process.env.NODE_ENV = "production";
      process.env.WEBHOOK_RETRY_JOB_ENABLED = "false";

      await job.register();

      const errorCalls = mockLogger.error.mock.calls.map((c) => c[1] || c[0]);
      const matched = errorCalls.find((msg) =>
        typeof msg === "string" &&
        /DISABLED in production/.test(msg) &&
        /WEBHOOK_RETRY_JOB_ENABLED=true/.test(msg),
      );
      expect(matched).toBeDefined();

      expect(sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("DISABLED in production"),
        "warning",
        expect.objectContaining({
          tags: expect.objectContaining({
            domain: "payment.webhook.retry_job_disabled_in_prod",
          }),
        }),
      );
    });

    test("em dev com job desligado → logger.info silencioso, sem sentry", async () => {
      process.env.NODE_ENV = "development";
      process.env.WEBHOOK_RETRY_JOB_ENABLED = "false";

      await job.register();

      const infoCalls = mockLogger.info.mock.calls.map((c) => c[1] || c[0]);
      const matched = infoCalls.find((msg) =>
        typeof msg === "string" && /disabled/.test(msg),
      );
      expect(matched).toBeDefined();
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });
  });
});
