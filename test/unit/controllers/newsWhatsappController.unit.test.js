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
    test("created=true on first subscription", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: { id: 7, phone: "31999991234", status: "pending" },
        created: true,
      });
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234", source: "home_news" } }),
        makeRes(),
        makeNext(),
      );
      expect(response.ok).toHaveBeenCalled();
      const [, payload, message] = response.ok.mock.calls[0];
      expect(payload.created).toBe(true);
      expect(payload.id).toBe(7);
      expect(message).toMatch(/registrada/i);
    });

    test("created=false when already subscribed", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: { id: 7, phone: "31999991234", status: "active" },
        created: false,
      });
      await ctrl.subscribe(
        makeReq({ body: { phone: "31999991234" } }),
        makeRes(),
        makeNext(),
      );
      const [, payload] = response.ok.mock.calls[0];
      expect(payload.created).toBe(false);
    });

    test("captures IP and user-agent (truncated to 255)", async () => {
      service.createOrReturn.mockResolvedValue({
        subscriber: { id: 1, phone: "31999991234", status: "pending" },
        created: true,
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
