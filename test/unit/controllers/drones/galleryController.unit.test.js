"use strict";

jest.mock("../../../../services/dronesService");
jest.mock("../../../../services/mediaService", () => ({
  persistMedia: jest.fn().mockResolvedValue([{ path: "/uploads/drones/file.jpg" }]),
}));
jest.mock("../../../../lib", () => ({ response: { ok: jest.fn(), created: jest.fn() } }));
jest.mock("../../../../controllers/drones/dronesFormatters", () => ({
  classify: jest.fn(() => ({ media_type: "IMAGE", max: 5 * 1024 * 1024 })),
  safeUnlink: jest.fn(),
  parseModelKey: jest.fn((k) => k),
  ensureModelExists: jest.fn().mockResolvedValue({ key: "agras" }),
}));

const dronesService = require("../../../../services/dronesService");
const { response } = require("../../../../lib");
const { classify, safeUnlink } = require("../../../../controllers/drones/dronesFormatters");
const ctrl = require("../../../../controllers/drones/galleryController");
const AppError = require("../../../../errors/AppError");

function makeReq(o = {}) { return { query: {}, params: {}, body: {}, file: null, ...o }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  classify.mockReturnValue({ media_type: "IMAGE", max: 5 * 1024 * 1024 });
});
afterEach(() => console.error.mockRestore());

describe("galleryController", () => {
  // ---- Model-scoped ----
  describe("listModelGallery", () => {
    test("success", async () => {
      dronesService.listGalleryAdmin.mockResolvedValue({ items: [], total: 0 });
      await ctrl.listModelGallery(makeReq({ params: { modelKey: "agras" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("createModelGalleryItem", () => {
    test("success with file", async () => {
      dronesService.createGalleryItem.mockResolvedValue(42);
      const file = { size: 1000, filename: "a.jpg" };
      await ctrl.createModelGalleryItem(
        makeReq({ params: { modelKey: "agras" }, file, body: { sort_order: "1" } }),
        makeRes(), makeNext()
      );
      expect(response.created).toHaveBeenCalled();
    });

    test("no file → 400", async () => {
      const next = makeNext();
      await ctrl.createModelGalleryItem(
        makeReq({ params: { modelKey: "agras" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("invalid file type → 400 + cleanup", async () => {
      classify.mockReturnValue(null);
      const file = { size: 1000, filename: "a.exe" };
      const next = makeNext();
      await ctrl.createModelGalleryItem(
        makeReq({ params: { modelKey: "agras" }, file }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
      expect(safeUnlink).toHaveBeenCalled();
    });

    test("file too large → 400", async () => {
      classify.mockReturnValue({ media_type: "IMAGE", max: 100 });
      const file = { size: 200, filename: "big.jpg" };
      const next = makeNext();
      await ctrl.createModelGalleryItem(
        makeReq({ params: { modelKey: "agras" }, file }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("updateModelGalleryItem", () => {
    test("success without file", async () => {
      dronesService.updateGalleryItem.mockResolvedValue(1);
      await ctrl.updateModelGalleryItem(
        makeReq({ params: { modelKey: "agras", itemId: "5" }, body: { title: "New" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("success with file", async () => {
      dronesService.updateGalleryItem.mockResolvedValue(1);
      const file = { size: 500, filename: "b.jpg" };
      await ctrl.updateModelGalleryItem(
        makeReq({ params: { modelKey: "agras", itemId: "5" }, file }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("invalid itemId → 400", async () => {
      const next = makeNext();
      await ctrl.updateModelGalleryItem(
        makeReq({ params: { modelKey: "agras", itemId: "0" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("deleteModelGalleryItem", () => {
    test("success", async () => {
      dronesService.deleteGalleryItem.mockResolvedValue(1);
      await ctrl.deleteModelGalleryItem(
        makeReq({ params: { modelKey: "agras", itemId: "5" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      dronesService.deleteGalleryItem.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.deleteModelGalleryItem(
        makeReq({ params: { modelKey: "agras", itemId: "5" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  // ---- Global gallery ----
  describe("listGallery", () => {
    test("success", async () => {
      dronesService.listGalleryAdmin.mockResolvedValue({ items: [] });
      await ctrl.listGallery(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("createGalleryItem", () => {
    test("success", async () => {
      dronesService.createGalleryItem.mockResolvedValue(10);
      const file = { size: 500, filename: "c.jpg" };
      await ctrl.createGalleryItem(
        makeReq({ file, body: { model_key: "agras" } }),
        makeRes(), makeNext()
      );
      expect(response.created).toHaveBeenCalled();
    });

    test("no file → 400", async () => {
      const next = makeNext();
      await ctrl.createGalleryItem(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("updateGalleryItem", () => {
    test("success", async () => {
      dronesService.updateGalleryItem.mockResolvedValue(1);
      await ctrl.updateGalleryItem(
        makeReq({ params: { id: "5" }, body: { title: "New" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      dronesService.updateGalleryItem.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.updateGalleryItem(
        makeReq({ params: { id: "5" }, body: { title: "X" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("invalid id → 400", async () => {
      const next = makeNext();
      await ctrl.updateGalleryItem(
        makeReq({ params: { id: "0" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("deleteGalleryItem", () => {
    test("success", async () => {
      dronesService.deleteGalleryItem.mockResolvedValue(1);
      await ctrl.deleteGalleryItem(makeReq({ params: { id: "5" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      dronesService.deleteGalleryItem.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.deleteGalleryItem(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });
});
