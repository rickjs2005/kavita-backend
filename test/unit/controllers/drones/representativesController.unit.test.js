"use strict";

jest.mock("../../../../services/dronesService");
jest.mock("../../../../lib", () => ({ response: { ok: jest.fn(), created: jest.fn() } }));
jest.mock("../../../../schemas/dronesSchemas", () => ({
  createRepresentativeBodySchema: {
    safeParse: jest.fn((b) => ({ success: true, data: b })),
  },
  updateRepresentativeBodySchema: {
    safeParse: jest.fn((b) => ({ success: true, data: b })),
  },
  formatDronesErrors: jest.fn(() => []),
}));

const dronesService = require("../../../../services/dronesService");
const { response } = require("../../../../lib");
const ctrl = require("../../../../controllers/drones/representativesController");
const AppError = require("../../../../errors/AppError");

function makeReq(o = {}) { return { query: {}, params: {}, body: {}, ...o }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("representativesController", () => {
  describe("listRepresentatives", () => {
    test("success", async () => {
      dronesService.listRepresentativesAdmin.mockResolvedValue({ items: [], total: 0 });
      await ctrl.listRepresentatives(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("parses query params", async () => {
      dronesService.listRepresentativesAdmin.mockResolvedValue({ items: [] });
      await ctrl.listRepresentatives(
        makeReq({ query: { page: "2", limit: "50", busca: "SP", includeInactive: "1" } }),
        makeRes(), makeNext()
      );
      expect(dronesService.listRepresentativesAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 50, busca: "SP", includeInactive: true })
      );
    });

    test("error", async () => {
      dronesService.listRepresentativesAdmin.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listRepresentatives(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("createRepresentative", () => {
    test("success", async () => {
      dronesService.createRepresentative.mockResolvedValue(42);
      await ctrl.createRepresentative(
        makeReq({ body: { name: "Rep", whatsapp: "123", cnpj: "x" } }),
        makeRes(), makeNext()
      );
      expect(response.created).toHaveBeenCalledWith(expect.anything(), { id: 42 }, "Representante criado.");
    });
  });

  describe("updateRepresentative", () => {
    test("success", async () => {
      dronesService.updateRepresentative.mockResolvedValue(1);
      await ctrl.updateRepresentative(
        makeReq({ params: { id: "5" }, body: { name: "New" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 5 }, "Representante atualizado.");
    });

    test("not found → 404", async () => {
      dronesService.updateRepresentative.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.updateRepresentative(
        makeReq({ params: { id: "5" }, body: { name: "X" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("invalid id → 400", async () => {
      const next = makeNext();
      await ctrl.updateRepresentative(
        makeReq({ params: { id: "abc" }, body: {} }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("deleteRepresentative", () => {
    test("success", async () => {
      dronesService.deleteRepresentative.mockResolvedValue(1);
      await ctrl.deleteRepresentative(makeReq({ params: { id: "5" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 5 }, "Representante removido.");
    });

    test("not found → 404", async () => {
      dronesService.deleteRepresentative.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.deleteRepresentative(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });
});
