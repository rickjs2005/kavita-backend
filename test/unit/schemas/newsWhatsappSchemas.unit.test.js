"use strict";

const {
  subscribeBodySchema,
  listSubscribersQuerySchema,
  digitsOnly,
} = require("../../../schemas/newsWhatsappSchemas");

describe("newsWhatsappSchemas", () => {
  describe("digitsOnly", () => {
    test("strips non-digit chars", () => {
      expect(digitsOnly("(31) 99999-1234")).toBe("31999991234");
      expect(digitsOnly("31 99999 1234")).toBe("31999991234");
      expect(digitsOnly("+55 (31) 9.9999-1234")).toBe("5531999991234");
    });

    test("handles null/undefined", () => {
      expect(digitsOnly(null)).toBe("");
      expect(digitsOnly(undefined)).toBe("");
      expect(digitsOnly("")).toBe("");
    });
  });

  describe("subscribeBodySchema", () => {
    test("accepts mobile (11 digits) with mask", () => {
      const r = subscribeBodySchema.safeParse({ phone: "(31) 99999-1234" });
      expect(r.success).toBe(true);
      expect(r.data.phone).toBe("31999991234");
      expect(r.data.source).toBe("home_news");
    });

    test("accepts landline (10 digits)", () => {
      const r = subscribeBodySchema.safeParse({ phone: "31 3333-4444" });
      expect(r.success).toBe(true);
      expect(r.data.phone).toBe("3133334444");
    });

    test("rejects too short", () => {
      const r = subscribeBodySchema.safeParse({ phone: "12345" });
      expect(r.success).toBe(false);
    });

    test("rejects too long", () => {
      const r = subscribeBodySchema.safeParse({ phone: "555531999991234" });
      expect(r.success).toBe(false);
    });

    test("rejects invalid DDD (00-10)", () => {
      const r = subscribeBodySchema.safeParse({ phone: "0099999-1234" });
      expect(r.success).toBe(false);
    });

    test("preserves explicit source", () => {
      const r = subscribeBodySchema.safeParse({
        phone: "31999991234",
        source: "corretora_landing",
      });
      expect(r.success).toBe(true);
      expect(r.data.source).toBe("corretora_landing");
    });

    test("falls back to home_news when source is empty string", () => {
      const r = subscribeBodySchema.safeParse({ phone: "31999991234", source: "" });
      expect(r.success).toBe(true);
      expect(r.data.source).toBe("home_news");
    });

    test("missing phone fails", () => {
      const r = subscribeBodySchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe("listSubscribersQuerySchema", () => {
    test("defaults limit/offset", () => {
      const r = listSubscribersQuerySchema.safeParse({});
      expect(r.success).toBe(true);
      expect(r.data.limit).toBe(50);
      expect(r.data.offset).toBe(0);
      expect(r.data.status).toBeUndefined();
    });

    test("coerces strings", () => {
      const r = listSubscribersQuerySchema.safeParse({ limit: "100", offset: "20" });
      expect(r.success).toBe(true);
      expect(r.data.limit).toBe(100);
      expect(r.data.offset).toBe(20);
    });

    test("caps limit at 200", () => {
      const r = listSubscribersQuerySchema.safeParse({ limit: 9999 });
      expect(r.success).toBe(false);
    });

    test("rejects unknown status", () => {
      const r = listSubscribersQuerySchema.safeParse({ status: "bogus" });
      expect(r.success).toBe(false);
    });

    test("accepts valid status", () => {
      const r = listSubscribersQuerySchema.safeParse({ status: "active" });
      expect(r.success).toBe(true);
      expect(r.data.status).toBe("active");
    });
  });
});
