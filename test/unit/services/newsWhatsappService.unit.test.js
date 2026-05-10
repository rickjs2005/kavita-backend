"use strict";

jest.mock("../../../repositories/newsWhatsappRepository");
jest.mock("../../../lib/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const repo = require("../../../repositories/newsWhatsappRepository");
const logger = require("../../../lib/logger");

// Reload service AFTER mocks (KAVITA_WHATSAPP_NUMBER é lido em module load).
function loadService(envNumber = "5531999990000") {
  jest.resetModules();
  process.env.KAVITA_WHATSAPP_NUMBER = envNumber;
  jest.doMock("../../../repositories/newsWhatsappRepository", () => repo);
  jest.doMock("../../../lib/logger", () => logger);
  return require("../../../services/newsWhatsappService");
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => typeof fn?.mockClear === "function" && fn.mockClear());
  Object.values(logger).forEach((fn) => typeof fn?.mockClear === "function" && fn.mockClear());
});

describe("newsWhatsappService", () => {
  describe("buildWhatsappOptinLink", () => {
    test("uses KAVITA_WHATSAPP_NUMBER + encoded message with short code", () => {
      const svc = loadService("5531999990000");
      const token = "abcdef0123456789".padEnd(64, "0");
      const link = svc.buildWhatsappOptinLink(token);
      expect(link).toMatch(/^https:\/\/wa\.me\/5531999990000\?text=/);
      // Short code é os primeiros 8 chars do token, uppercase.
      expect(decodeURIComponent(link)).toContain("ABCDEF01");
    });

    test("falls back to bare wa.me when env is missing", () => {
      const svc = loadService("");
      const link = svc.buildWhatsappOptinLink("a".repeat(64));
      expect(link).toMatch(/^https:\/\/wa\.me\/\?text=/);
    });
  });

  describe("shortCodeFromToken", () => {
    test("uppercases first 8 chars", () => {
      const svc = loadService();
      expect(svc.shortCodeFromToken("abcdef0123456789xxx")).toBe("ABCDEF01");
      expect(svc.shortCodeFromToken("")).toBe("");
      expect(svc.shortCodeFromToken(null)).toBe("");
    });
  });

  describe("createOrReturn", () => {
    test("returns existing without creating when phone already known", async () => {
      const svc = loadService();
      repo.getByPhone.mockResolvedValue({
        id: 1,
        phone: "31999991234",
        status: "pending",
        confirm_token: "a".repeat(64),
      });
      const result = await svc.createOrReturn({ phone: "31999991234" });
      expect(result.created).toBe(false);
      expect(repo.createSubscriber).not.toHaveBeenCalled();
      expect(result.optinLink).toMatch(/wa\.me/);
    });

    test("creates fresh subscriber when phone is new", async () => {
      const svc = loadService();
      repo.getByPhone
        .mockResolvedValueOnce(null) // primeira leitura
        .mockResolvedValueOnce({
          id: 7,
          phone: "31999991234",
          status: "pending",
          confirm_token: "f".repeat(64),
        });
      repo.createSubscriber.mockResolvedValue({ insertId: 7 });

      const result = await svc.createOrReturn({
        phone: "31999991234",
        source: "home_news",
        ip: "1.2.3.4",
        user_agent: "ua",
      });
      expect(result.created).toBe(true);
      expect(repo.createSubscriber).toHaveBeenCalledWith({
        phone: "31999991234",
        source: "home_news",
        ip: "1.2.3.4",
        user_agent: "ua",
      });
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe("confirmByToken", () => {
    const token = "a".repeat(64);

    test("NOT_FOUND when token unknown", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue(null);
      const r = await svc.confirmByToken(token);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("NOT_FOUND");
    });

    test("UNSUBSCRIBED blocks reactivation", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue({ id: 1, status: "unsubscribed" });
      const r = await svc.confirmByToken(token);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("UNSUBSCRIBED");
      expect(logger.warn).toHaveBeenCalled();
    });

    test("idempotent — already active", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue({ id: 1, status: "active" });
      repo.getById.mockResolvedValue({ id: 1, status: "active" });
      const r = await svc.confirmByToken(token);
      expect(r.ok).toBe(true);
      expect(r.alreadyActive).toBe(true);
      expect(repo.confirmSubscriber).not.toHaveBeenCalled();
    });

    test("activates pending → active", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue({ id: 1, status: "pending" });
      repo.getById.mockResolvedValue({ id: 1, status: "active" });
      repo.confirmSubscriber.mockResolvedValue({ affectedRows: 1 });
      const r = await svc.confirmByToken(token);
      expect(r.ok).toBe(true);
      expect(r.alreadyActive).toBe(false);
      expect(repo.confirmSubscriber).toHaveBeenCalledWith(1);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe("unsubscribeByToken", () => {
    test("NOT_FOUND when token unknown", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue(null);
      const r = await svc.unsubscribeByToken("a".repeat(64));
      expect(r.ok).toBe(false);
      expect(r.code).toBe("NOT_FOUND");
    });

    test("idempotent — already unsubscribed", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue({ id: 1, status: "unsubscribed" });
      const r = await svc.unsubscribeByToken("a".repeat(64));
      expect(r.ok).toBe(true);
      expect(r.alreadyUnsubscribed).toBe(true);
      expect(repo.unsubscribeSubscriber).not.toHaveBeenCalled();
    });

    test("opts out from active", async () => {
      const svc = loadService();
      repo.getByConfirmToken.mockResolvedValue({ id: 1, status: "active" });
      repo.unsubscribeSubscriber.mockResolvedValue({ affectedRows: 1 });
      const r = await svc.unsubscribeByToken("a".repeat(64));
      expect(r.alreadyUnsubscribed).toBe(false);
      expect(repo.unsubscribeSubscriber).toHaveBeenCalledWith(1);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe("updateStatusByAdmin", () => {
    test("logs adminId, fromStatus and toStatus", async () => {
      const svc = loadService();
      repo.getById
        .mockResolvedValueOnce({ id: 1, status: "pending" })
        .mockResolvedValueOnce({ id: 1, status: "active" });
      repo.updateStatus.mockResolvedValue({ affectedRows: 1 });

      const r = await svc.updateStatusByAdmin({ id: 1, status: "active", adminId: 99 });
      expect(r.ok).toBe(true);
      expect(repo.updateStatus).toHaveBeenCalledWith(1, "active");
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriberId: 1,
          fromStatus: "pending",
          toStatus: "active",
          adminId: 99,
        }),
        expect.any(String),
      );
    });

    test("NOT_FOUND when subscriber missing", async () => {
      const svc = loadService();
      repo.getById.mockResolvedValue(null);
      const r = await svc.updateStatusByAdmin({ id: 999, status: "active" });
      expect(r.ok).toBe(false);
      expect(r.code).toBe("NOT_FOUND");
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
