"use strict";

jest.mock("../../../../repositories/dronesRepository");
jest.mock("../../../../services/drones/helpers", () => ({
  clampInt: jest.fn((v, def, min, max) => Math.min(Math.max(Number(v) || def, min), max)),
  safeParseJson: jest.fn((v, fallback) => {
    if (v == null) return fallback;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return fallback; } }
    return v;
  }),
  sanitizeText: jest.fn((v) => v || ""),
}));
jest.mock("../../../../services/drones/pageService", () => ({
  getPageSettings: jest.fn().mockResolvedValue({ models_json: null }),
  upsertPageSettings: jest.fn().mockResolvedValue(),
}));

const dronesRepo = require("../../../../repositories/dronesRepository");
const pageService = require("../../../../services/drones/pageService");
const service = require("../../../../services/drones/modelsService");

beforeEach(() => jest.clearAllMocks());

describe("drones/modelsService", () => {
  describe("getModelInfo", () => {
    test("returns model info from page settings", async () => {
      pageService.getPageSettings.mockResolvedValue({
        models_json: '{"agras":{"specs_title":"Specs"}}',
      });

      const result = await service.getModelInfo("agras");
      expect(result).toBeTruthy();
    });

    test("returns default shape when model_key not in models_json", async () => {
      pageService.getPageSettings.mockResolvedValue({ models_json: '{"other":{}}' });

      const result = await service.getModelInfo("agras");
      // returns normalized default object (not null) when key is missing
      expect(result).toBeTruthy();
      expect(result.specs_items).toEqual([]);
    });
  });
});
