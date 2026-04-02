"use strict";

jest.mock("../../../repositories/promocoesAdminRepository");
jest.mock("../../../lib", () => ({
  response: { ok: jest.fn(), created: jest.fn(), noContent: jest.fn() },
}));

const repo = require("../../../repositories/promocoesAdminRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/promocoesAdminController");
const AppError = require("../../../errors/AppError");

function makeReq(overrides = {}) { return { params: {}, body: {}, ...overrides }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

describe("promocoesAdminController", () => {
  describe("list", () => {
    test("success", async () => {
      const data = [{ id: 1 }];
      repo.findAll.mockResolvedValue(data);
      await ctrl.list(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });
  });

  describe("create", () => {
    test("success", async () => {
      repo.productExists.mockResolvedValue(true);
      repo.promoExistsForProduct.mockResolvedValue(false);
      repo.create.mockResolvedValue();
      const body = { product_id: 1, discount_percent: 10 };
      await ctrl.create(makeReq({ body }), makeRes(), makeNext());
      expect(response.created).toHaveBeenCalled();
    });

    test("product not found → 404", async () => {
      repo.productExists.mockResolvedValue(false);
      const next = makeNext();
      await ctrl.create(makeReq({ body: { product_id: 999 } }), makeRes(), next);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe("NOT_FOUND");
    });

    test("duplicate promo → CONFLICT 409", async () => {
      repo.productExists.mockResolvedValue(true);
      repo.promoExistsForProduct.mockResolvedValue(true);
      const next = makeNext();
      await ctrl.create(makeReq({ body: { product_id: 1 } }), makeRes(), next);
      const err = next.mock.calls[0][0];
      expect(err.code).toBe("CONFLICT");
      expect(err.status).toBe(409);
    });
  });

  describe("update", () => {
    test("success", async () => {
      repo.findById.mockResolvedValue({ id: 1 });
      repo.update.mockResolvedValue(true);
      await ctrl.update(makeReq({ params: { id: 1 }, body: { title: "X" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      repo.findById.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.update(makeReq({ params: { id: 999 }, body: {} }), makeRes(), next);
      const err = next.mock.calls[0][0];
      expect(err.code).toBe("NOT_FOUND");
    });
  });

  describe("remove", () => {
    test("success → noContent", async () => {
      repo.remove.mockResolvedValue(true);
      await ctrl.remove(makeReq({ params: { id: 1 } }), makeRes(), makeNext());
      expect(response.noContent).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      repo.remove.mockResolvedValue(false);
      const next = makeNext();
      await ctrl.remove(makeReq({ params: { id: 999 } }), makeRes(), next);
      const err = next.mock.calls[0][0];
      expect(err.code).toBe("NOT_FOUND");
    });
  });
});
