"use strict";

jest.mock("../../../../services/dronesService");
jest.mock("../../../../lib", () => ({ response: { ok: jest.fn(), created: jest.fn() } }));
jest.mock("../../../../controllers/drones/dronesFormatters", () => ({
  DEFAULT_DRONE_MODELS: [{ key: "default" }],
  parseJsonField: jest.fn((v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } }),
  extractItems: jest.fn((r) => r?.items || r?.data?.items || []),
  parseModelKey: jest.fn((k) => k),
  ensureModelExists: jest.fn().mockResolvedValue({ key: "agras", label: "Agras T40" }),
}));
jest.mock("../../../../schemas/dronesSchemas", () => ({
  createModelBodySchema: {
    safeParse: jest.fn((b) => ({ success: true, data: { key: b.key || "k", label: b.label || "L", sort_order: 0, is_active: 1 } })),
  },
  mediaSelectionBodySchema: {
    safeParse: jest.fn((b) => ({ success: true, data: { target: b.target || "cover", media_id: b.media_id || 1 } })),
  },
  formatDronesErrors: jest.fn(() => []),
}));

const dronesService = require("../../../../services/dronesService");
const { response } = require("../../../../lib");
const { ensureModelExists } = require("../../../../controllers/drones/dronesFormatters");
const ctrl = require("../../../../controllers/drones/modelsController");
const AppError = require("../../../../errors/AppError");

function makeReq(o = {}) { return { query: {}, params: {}, body: {}, ...o }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  dronesService.sanitizeText = jest.fn((v) => v || null);
  dronesService.softDeleteDroneModel = jest.fn().mockResolvedValue();
  dronesService.hardDeleteDroneModel = jest.fn().mockResolvedValue();
  dronesService.getDroneModelByKey = jest.fn().mockResolvedValue({ key: "agras" });
  dronesService.upsertModelSelection = jest.fn().mockResolvedValue();
});
afterEach(() => console.error.mockRestore());

describe("modelsController", () => {
  describe("listModels", () => {
    test("returns items from service", async () => {
      dronesService.listDroneModels.mockResolvedValue([{ key: "agras" }]);
      await ctrl.listModels(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { items: [{ key: "agras" }] });
    });

    test("returns DEFAULT_DRONE_MODELS when empty", async () => {
      dronesService.listDroneModels.mockResolvedValue([]);
      await ctrl.listModels(makeReq(), makeRes(), makeNext());
      const data = response.ok.mock.calls[0][1];
      expect(data.items).toEqual([{ key: "default" }]);
    });

    test("error → next", async () => {
      dronesService.listDroneModels.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listModels(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("createModel", () => {
    test("success", async () => {
      dronesService.createDroneModel.mockResolvedValue();
      await ctrl.createModel(makeReq({ body: { key: "t50", label: "T50" } }), makeRes(), makeNext());
      expect(response.created).toHaveBeenCalled();
    });

    test("duplicate key → CONFLICT", async () => {
      const err = new Error("DUPLICATE_MODEL_KEY");
      err.code = "DUPLICATE_MODEL_KEY";
      dronesService.createDroneModel.mockRejectedValue(err);
      const next = makeNext();
      await ctrl.createModel(makeReq({ body: { key: "dup" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("CONFLICT");
    });
  });

  describe("deleteModel", () => {
    test("soft delete", async () => {
      dronesService.softDeleteDroneModel.mockResolvedValue();
      await ctrl.deleteModel(makeReq({ params: { modelKey: "agras" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("hard delete", async () => {
      dronesService.hardDeleteDroneModel.mockResolvedValue();
      await ctrl.deleteModel(makeReq({ params: { modelKey: "agras" }, query: { hard: "1" } }), makeRes(), makeNext());
      expect(dronesService.hardDeleteDroneModel).toHaveBeenCalledWith("agras");
    });
  });

  describe("getModelAggregate", () => {
    test("success", async () => {
      dronesService.getPageSettings.mockResolvedValue({ models_json: '{}' });
      dronesService.listGalleryAdmin.mockResolvedValue({ items: [] });
      await ctrl.getModelAggregate(makeReq({ params: { modelKey: "agras" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("upsertModelInfo", () => {
    test("success with patch fields", async () => {
      dronesService.getPageSettings.mockResolvedValue({ models_json: '{}' });
      dronesService.upsertPageSettings.mockResolvedValue({ models_json: '{}' });
      await ctrl.upsertModelInfo(
        makeReq({ params: { modelKey: "agras" }, body: { specs_title: "Specs", specs_items_json: [{ t: "a" }] } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("bad JSON → 400", async () => {
      const next = makeNext();
      await ctrl.upsertModelInfo(
        makeReq({ params: { modelKey: "agras" }, body: { specs_items_json: "not-array" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("setModelMediaSelection", () => {
    test("success", async () => {
      dronesService.listGalleryAdmin.mockResolvedValue({ items: [{ id: 1, model_key: "agras" }] });
      dronesService.upsertModelSelection.mockResolvedValue();
      dronesService.getDroneModelByKey.mockResolvedValue({ key: "agras" });
      await ctrl.setModelMediaSelection(
        makeReq({ params: { modelKey: "agras" }, body: { target: "cover", media_id: 1 } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("media not found → 404", async () => {
      dronesService.listGalleryAdmin.mockResolvedValue({ items: [] });
      const next = makeNext();
      await ctrl.setModelMediaSelection(
        makeReq({ params: { modelKey: "agras" }, body: { target: "cover", media_id: 999 } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });
});
