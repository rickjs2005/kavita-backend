// test/unit/services/corretoraKycService.unit.test.js
"use strict";

const AppError = require("../../../errors/AppError");
const service = require("../../../services/corretoraKycService");

describe("corretoraKycService.requireVerifiedOrThrow (gate de emissão)", () => {
  it("passa silenciosamente quando kyc_status=verified", () => {
    expect(() =>
      service.requireVerifiedOrThrow({ id: 1, kyc_status: "verified" }),
    ).not.toThrow();
  });

  it("lança 403 quando pending_verification", () => {
    expect(() =>
      service.requireVerifiedOrThrow({
        id: 1,
        kyc_status: "pending_verification",
      }),
    ).toThrow(AppError);
  });

  it("lança 403 quando under_review", () => {
    try {
      service.requireVerifiedOrThrow({ id: 1, kyc_status: "under_review" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(403);
      expect(err.details?.kyc_status).toBe("under_review");
    }
  });

  it("lança 403 quando rejected", () => {
    expect(() =>
      service.requireVerifiedOrThrow({ id: 1, kyc_status: "rejected" }),
    ).toThrow();
  });

  it("lança 403 quando corretora é null/undefined", () => {
    expect(() => service.requireVerifiedOrThrow(null)).toThrow();
    expect(() => service.requireVerifiedOrThrow(undefined)).toThrow();
  });
});

describe("corretoraKycService.VALID_TRANSITIONS (FSM)", () => {
  it("verified é terminal no MVP (sem transições de saída)", () => {
    expect(service.VALID_TRANSITIONS.verified.size).toBe(0);
  });

  it("pending_verification → under_review|verified|rejected", () => {
    expect(service.VALID_TRANSITIONS.pending_verification).toEqual(
      new Set(["under_review", "verified", "rejected"]),
    );
  });

  it("under_review → verified|rejected|pending_verification", () => {
    expect(service.VALID_TRANSITIONS.under_review).toEqual(
      new Set(["verified", "rejected", "pending_verification"]),
    );
  });

  it("rejected → under_review (possibilidade de resubmission)", () => {
    expect(service.VALID_TRANSITIONS.rejected).toEqual(
      new Set(["under_review"]),
    );
  });
});
