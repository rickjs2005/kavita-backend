"use strict";

jest.mock("../../../repositories/statsRepository");
jest.mock("../../../lib", () => ({
  response: { ok: jest.fn() },
}));

const repo = require("../../../repositories/statsRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/statsController");

function makeReq(q = {}) { return { query: q }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

describe("statsController", () => {
  describe("getResumo", () => {
    test("success", async () => {
      const data = { totalProdutos: 10, totalClientes: 5 };
      repo.getDashboardSummary.mockResolvedValue(data);
      await ctrl.getResumo(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });

    test("error", async () => {
      repo.getDashboardSummary.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.getResumo(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("getVendas", () => {
    test("success — fills gaps in date range", async () => {
      repo.getSalesSeries.mockResolvedValue([]);
      await ctrl.getVendas(makeReq({ range: 3 }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      const callData = response.ok.mock.calls[0][1];
      expect(callData.rangeDays).toBe(3);
      expect(callData.points).toHaveLength(3);
    });

    test("error", async () => {
      repo.getSalesSeries.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.getVendas(makeReq({ range: 7 }), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("getTopProdutos", () => {
    test("success", async () => {
      const data = [{ id: 1, name: "P1" }];
      repo.getTopProducts.mockResolvedValue(data);
      await ctrl.getTopProdutos(makeReq({ limit: 5 }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });
  });

  describe("getAlertas", () => {
    test("returns empty array", async () => {
      await ctrl.getAlertas(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), []);
    });
  });
});
