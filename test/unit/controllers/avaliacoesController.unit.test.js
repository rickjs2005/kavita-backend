"use strict";

jest.mock("../../../repositories/avaliacoesRepository");
jest.mock("../../../services/avaliacoesService");
jest.mock("../../../lib", () => ({
  response: { ok: jest.fn(), created: jest.fn() },
}));

const repo = require("../../../repositories/avaliacoesRepository");
const service = require("../../../services/avaliacoesService");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/avaliacoesController");

function makeReq(overrides = {}) {
  return { query: {}, params: {}, body: {}, user: { id: 7 }, ...overrides };
}
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

describe("avaliacoesController", () => {
  describe("quickSearch", () => {
    test("empty busca returns empty array", async () => {
      await ctrl.quickSearch(makeReq({ query: { busca: "", limit: 10 } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), []);
      expect(repo.quickSearch).not.toHaveBeenCalled();
    });

    test("with busca delegates to repo", async () => {
      const data = [{ id: 1, name: "Produto" }];
      repo.quickSearch.mockResolvedValue(data);
      await ctrl.quickSearch(makeReq({ query: { busca: "fert", limit: 10 } }), makeRes(), makeNext());
      expect(repo.quickSearch).toHaveBeenCalledWith("fert", 10);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });

    test("error calls next", async () => {
      repo.quickSearch.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.quickSearch(makeReq({ query: { busca: "x", limit: 5 } }), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("createReview", () => {
    test("success", async () => {
      service.createReview.mockResolvedValue();
      const body = { produto_id: 1, nota: 5, comentario: "Great" };
      await ctrl.createReview(makeReq({ body }), makeRes(), makeNext());
      expect(service.createReview).toHaveBeenCalledWith(1, 7, 5, "Great");
      expect(response.created).toHaveBeenCalled();
    });

    test("error calls next", async () => {
      service.createReview.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.createReview(makeReq({ body: { produto_id: 1, nota: 5 } }), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("listReviews", () => {
    test("success", async () => {
      const data = [{ nota: 5, comentario: "Bom" }];
      repo.findByProductId.mockResolvedValue(data);
      await ctrl.listReviews(makeReq({ params: { id: 1 } }), makeRes(), makeNext());
      expect(repo.findByProductId).toHaveBeenCalledWith(1);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });
  });
});
