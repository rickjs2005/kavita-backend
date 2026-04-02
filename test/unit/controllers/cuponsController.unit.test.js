"use strict";

jest.mock("../../../repositories/cuponsRepository");
jest.mock("../../../lib", () => ({
  response: { ok: jest.fn(), created: jest.fn(), noContent: jest.fn() },
}));

const repo = require("../../../repositories/cuponsRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/cuponsController");
const AppError = require("../../../errors/AppError");

function makeReq(overrides = {}) { return { params: {}, body: {}, ...overrides }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

describe("cuponsController", () => {
  describe("list", () => {
    test("success", async () => {
      const data = [{ id: 1, codigo: "A10" }];
      repo.findAll.mockResolvedValue(data);
      await ctrl.list(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });
  });

  describe("create", () => {
    test("success", async () => {
      const cupom = { id: 1, codigo: "A10" };
      repo.create.mockResolvedValue(cupom);
      await ctrl.create(makeReq({ body: { codigo: "A10" } }), makeRes(), makeNext());
      expect(response.created).toHaveBeenCalledWith(expect.anything(), cupom);
    });

    test("ER_DUP_ENTRY → CONFLICT", async () => {
      const err = new Error("dup");
      err.code = "ER_DUP_ENTRY";
      repo.create.mockRejectedValue(err);
      const next = makeNext();
      await ctrl.create(makeReq({ body: { codigo: "A10" } }), makeRes(), next);
      expect(next).toHaveBeenCalled();
      const passedErr = next.mock.calls[0][0];
      expect(passedErr).toBeInstanceOf(AppError);
      expect(passedErr.code).toBe("CONFLICT");
      expect(passedErr.status).toBe(409);
    });
  });

  describe("update", () => {
    test("success", async () => {
      const cupom = { id: 1, codigo: "B20" };
      repo.update.mockResolvedValue(cupom);
      await ctrl.update(makeReq({ params: { id: 1 }, body: { codigo: "B20" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), cupom);
    });

    test("not found → AppError 404", async () => {
      repo.update.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.update(makeReq({ params: { id: 999 }, body: {} }), makeRes(), next);
      expect(next).toHaveBeenCalled();
      const passedErr = next.mock.calls[0][0];
      expect(passedErr.code).toBe("NOT_FOUND");
    });

    test("ER_DUP_ENTRY → CONFLICT", async () => {
      const err = new Error("dup");
      err.code = "ER_DUP_ENTRY";
      repo.update.mockRejectedValue(err);
      const next = makeNext();
      await ctrl.update(makeReq({ params: { id: 1 }, body: {} }), makeRes(), next);
      const passedErr = next.mock.calls[0][0];
      expect(passedErr.code).toBe("CONFLICT");
    });
  });

  describe("remove", () => {
    test("success → noContent", async () => {
      repo.remove.mockResolvedValue(true);
      await ctrl.remove(makeReq({ params: { id: 1 } }), makeRes(), makeNext());
      expect(response.noContent).toHaveBeenCalled();
    });

    test("not found → AppError 404", async () => {
      repo.remove.mockResolvedValue(false);
      const next = makeNext();
      await ctrl.remove(makeReq({ params: { id: 999 } }), makeRes(), next);
      const passedErr = next.mock.calls[0][0];
      expect(passedErr.code).toBe("NOT_FOUND");
    });
  });
});
