"use strict";

jest.mock("../../../services/newsWhatsappService");
jest.mock("../../../lib", () => ({ response: { ok: jest.fn() } }));

const service = require("../../../services/newsWhatsappService");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/newsWhatsappController");
const AppError = require("../../../errors/AppError");

function makeReq(o = {}) {
  return {
    body: {},
    query: {},
    params: {},
    ip: "1.2.3.4",
    get: () => "Mozilla/5.0 (test)",
    ...o,
  };
}
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  Object.values(service).forEach((fn) => typeof fn?.mockClear === "function" && fn.mockClear());
  response.ok.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("newsWhatsappController", () => {
  describe("subscribe", () => {
    const baseSubscriber = {
      id: 7,
      phone: "31999991234",
      status: "pending",
      confirm_token: "a".repeat(64),
    };

    test("created=true on first subscription, includes optin link + token + short code", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: baseSubscriber,
        created: true,
        optinLink: "https://wa.me/5531999990000?text=...",
        shortCode: "AAAAAAAA",
      });
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234", source: "home_news" } }),
        makeRes(),
        makeNext(),
      );
      const [, payload, message] = response.ok.mock.calls[0];
      expect(payload.created).toBe(true);
      expect(payload.id).toBe(7);
      expect(payload.confirm_token).toHaveLength(64);
      expect(payload.short_code).toBe("AAAAAAAA");
      expect(payload.whatsapp_optin_link).toMatch(/^https:\/\/wa\.me/);
      expect(message).toMatch(/registrada/i);
    });

    test("created=false when already subscribed (still returns link)", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: { ...baseSubscriber, status: "active" },
        created: false,
        optinLink: "https://wa.me/5531999990000?text=...",
        shortCode: "AAAAAAAA",
      });
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234" } }),
        makeRes(),
        makeNext(),
      );
      const [, payload] = response.ok.mock.calls[0];
      expect(payload.created).toBe(false);
      expect(payload.whatsapp_optin_link).toBeTruthy();
    });

    test("captures IP and user-agent (truncated to 255)", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: baseSubscriber,
        created: true,
        optinLink: null,
        shortCode: null,
      });
      const longUA = "x".repeat(400);
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234" }, get: () => longUA }),
        makeRes(),
        makeNext(),
      );
      const args = service.createOrReturn.mock.calls[0][0];
      expect(args.ip).toBe("1.2.3.4");
      expect(args.user_agent.length).toBe(255);
    });

    test("service error → 500 via AppError", async () => {
      service.createOrReturn.mockRejectedValue(new Error("db down"));
      const next = makeNext();
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234" } }),
        makeRes(),
        next,
      );
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("confirm", () => {
    const validToken = "a".repeat(64);

    test("confirms pending → active", async () => {
      service.confirmByToken.mockResolvedValue({
        ok: true,
        alreadyActive: false,
        status: "active",
      });
      await ctrl.confirm(
        makeReq({ body: { token: validToken } }),
        makeRes(),
        makeNext(),
      );
      const [, payload, message] = response.ok.mock.calls[0];
      expect(payload.status).toBe("active");
      expect(payload.alreadyActive).toBe(false);
      expect(message).toMatch(/confirmada/i);
    });

    test("idempotent — already active", async () => {
      service.confirmByToken.mockResolvedValue({
        ok: true,
        alreadyActive: true,
        status: "active",
      });
      await ctrl.confirm(
        makeReq({ body: { token: validToken } }),
        makeRes(),
        makeNext(),
      );
      const [, payload, message] = response.ok.mock.calls[0];
      expect(payload.alreadyActive).toBe(true);
      expect(message).toMatch(/ja estava/i);
    });

    test("token NOT_FOUND → 404", async () => {
      service.confirmByToken.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
      const next = makeNext();
      await ctrl.confirm(makeReq({ body: { token: validToken } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("subscriber UNSUBSCRIBED → 409 CONFLICT (no auto-reactivation)", async () => {
      service.confirmByToken.mockResolvedValue({ ok: false, code: "UNSUBSCRIBED" });
      const next = makeNext();
      await ctrl.confirm(makeReq({ body: { token: validToken } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("CONFLICT");
      expect(next.mock.calls[0][0].status).toBe(409);
    });
  });

  describe("unsubscribe", () => {
    const validToken = "b".repeat(64);

    test("opts out — first time", async () => {
      service.unsubscribeByToken.mockResolvedValue({
        ok: true,
        alreadyUnsubscribed: false,
        status: "unsubscribed",
      });
      await ctrl.unsubscribe(
        makeReq({ body: { token: validToken } }),
        makeRes(),
        makeNext(),
      );
      const [, payload, message] = response.ok.mock.calls[0];
      expect(payload.status).toBe("unsubscribed");
      expect(payload.alreadyUnsubscribed).toBe(false);
      expect(message).toMatch(/cancelada/i);
    });

    test("idempotent — already unsubscribed", async () => {
      service.unsubscribeByToken.mockResolvedValue({
        ok: true,
        alreadyUnsubscribed: true,
        status: "unsubscribed",
      });
      await ctrl.unsubscribe(
        makeReq({ body: { token: validToken } }),
        makeRes(),
        makeNext(),
      );
      const [, , message] = response.ok.mock.calls[0];
      expect(message).toMatch(/ja estava/i);
    });

    test("token NOT_FOUND → 404", async () => {
      service.unsubscribeByToken.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
      const next = makeNext();
      await ctrl.unsubscribe(makeReq({ body: { token: validToken } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  describe("adminUpdateStatus", () => {
    test("forwards id + status + adminId to service", async () => {
      service.updateStatusByAdmin.mockResolvedValue({
        ok: true,
        subscriber: { id: 7, status: "active" },
      });
      await ctrl.adminUpdateStatus(
        makeReq({
          params: { id: 7 },
          body: { status: "active" },
          adminUser: { id: 99 },
        }),
        makeRes(),
        makeNext(),
      );
      expect(service.updateStatusByAdmin).toHaveBeenCalledWith({
        id: 7,
        status: "active",
        adminId: 99,
      });
    });

    test("404 when service returns NOT_FOUND", async () => {
      service.updateStatusByAdmin.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
      const next = makeNext();
      await ctrl.adminUpdateStatus(
        makeReq({ params: { id: 999 }, body: { status: "active" } }),
        makeRes(),
        next,
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("falls back to req.user.id when adminUser is missing", async () => {
      service.updateStatusByAdmin.mockResolvedValue({
        ok: true,
        subscriber: { id: 7, status: "active" },
      });
      await ctrl.adminUpdateStatus(
        makeReq({
          params: { id: 7 },
          body: { status: "active" },
          user: { id: 5 },
        }),
        makeRes(),
        makeNext(),
      );
      expect(service.updateStatusByAdmin.mock.calls[0][0].adminId).toBe(5);
    });
  });

  describe("listSubscribers", () => {
    test("forwards pagination + status filter and returns meta with total", async () => {
      service.listForAdmin.mockResolvedValue({
        rows: [{ id: 1, phone: "31999991234" }],
        total: 42,
      });
      await ctrl.listSubscribers(
        makeReq({ query: { limit: 25, offset: 50, status: "active" } }),
        makeRes(),
        makeNext(),
      );
      expect(service.listForAdmin).toHaveBeenCalledWith({
        limit: 25,
        offset: 50,
        status: "active",
      });
      const [, payload, , meta] = response.ok.mock.calls[0];
      expect(Array.isArray(payload)).toBe(true);
      expect(meta.total).toBe(42);
      expect(meta.status).toBe("active");
    });

    test("error → 500", async () => {
      service.listForAdmin.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listSubscribers(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });
});
