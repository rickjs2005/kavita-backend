"use strict";

jest.mock("../../../../services/dronesService");
jest.mock("../../../../services/mediaService", () => ({
  persistMedia: jest.fn().mockResolvedValue([{ path: "/uploads/drones/f.mp4" }]),
}));
jest.mock("../../../../lib", () => ({
  response: { ok: jest.fn() },
}));

const dronesService = require("../../../../services/dronesService");
const { response } = require("../../../../lib");
const ctrl = require("../../../../controllers/drones/pageController");
const AppError = require("../../../../errors/AppError");

function makeReq(overrides = {}) {
  return { body: {}, files: {}, ...overrides };
}
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  dronesService.sanitizeText = jest.fn((v) => v);
});
afterEach(() => console.error.mockRestore());

describe("pageController", () => {
  describe("getPage", () => {
    test("returns null when no row", async () => {
      dronesService.getPageSettings.mockResolvedValue(null);
      await ctrl.getPage(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), null);
    });

    test("returns parsed JSON fields", async () => {
      dronesService.getPageSettings.mockResolvedValue({
        hero_title: "Title",
        specs_items_json: '["a"]',
        features_items_json: null,
        benefits_items_json: null,
        sections_order_json: null,
        models_json: null,
      });
      await ctrl.getPage(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      const data = response.ok.mock.calls[0][1];
      expect(data.specs_items_json).toEqual(["a"]);
    });

    test("error → next(AppError 500)", async () => {
      dronesService.getPageSettings.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.getPage(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("upsertPage", () => {
    test("success without files", async () => {
      dronesService.sanitizeText.mockReturnValue("Title");
      dronesService.upsertPageSettings.mockResolvedValue({ id: 1 });
      await ctrl.upsertPage(
        makeReq({ body: { hero_title: "Title" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("missing hero_title → 400", async () => {
      dronesService.sanitizeText.mockReturnValue("");
      const next = makeNext();
      await ctrl.upsertPage(makeReq({ body: {} }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("with JSON body fields", async () => {
      dronesService.sanitizeText.mockReturnValue("Title");
      dronesService.upsertPageSettings.mockResolvedValue({ id: 1 });

      const req = makeReq({
        body: {
          hero_title: "Title",
          specs_items_json: '[{"t":"a"}]',
          features_items_json: '[{"t":"b"}]',
          benefits_items_json: '[{"t":"c"}]',
          sections_order_json: '["hero","specs"]',
          models_json: '{"agras":{}}',
        },
      });
      await ctrl.upsertPage(req, makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("resetPageToDefault", () => {
    test("success", async () => {
      dronesService.upsertPageSettings.mockResolvedValue();
      await ctrl.resetPageToDefault(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), null, "Página resetada para padrão.");
    });

    test("error → 500", async () => {
      dronesService.upsertPageSettings.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.resetPageToDefault(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("getLandingConfig", () => {
    test("returns null when no row", async () => {
      dronesService.getPageSettings.mockResolvedValue(null);
      await ctrl.getLandingConfig(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), null);
    });

    test("returns landing fields when row exists", async () => {
      dronesService.getPageSettings.mockResolvedValue({
        hero_title: "T", hero_subtitle: "S", hero_video_path: null,
        hero_image_fallback_path: null, cta_title: null,
        cta_message_template: null, cta_button_label: null,
        sections_order_json: '["hero"]',
      });
      await ctrl.getLandingConfig(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      const data = response.ok.mock.calls[0][1];
      expect(data.hero_title).toBe("T");
      expect(data.sections_order_json).toEqual(["hero"]);
    });
  });

  describe("upsertLandingConfig", () => {
    test("success without files", async () => {
      dronesService.sanitizeText.mockReturnValue("Title");
      dronesService.upsertPageSettings.mockResolvedValue({ id: 1 });
      await ctrl.upsertLandingConfig(
        makeReq({ body: { hero_title: "Title" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("missing hero_title → 400", async () => {
      dronesService.sanitizeText.mockReturnValue("");
      const next = makeNext();
      await ctrl.upsertLandingConfig(makeReq({ body: {} }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("with sections_order_json body", async () => {
      dronesService.sanitizeText.mockReturnValue("Title");
      dronesService.upsertPageSettings.mockResolvedValue({ id: 1 });
      await ctrl.upsertLandingConfig(
        makeReq({ body: { hero_title: "Title", sections_order_json: '["hero","specs"]', cta_title: "CTA" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("error → wraps in 500", async () => {
      dronesService.sanitizeText.mockReturnValue("Title");
      dronesService.upsertPageSettings.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.upsertLandingConfig(makeReq({ body: { hero_title: "T" } }), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });

    test("getLandingConfig error → 500", async () => {
      dronesService.getPageSettings.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.getLandingConfig(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });
});
