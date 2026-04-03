"use strict";

jest.mock("../../../../repositories/dronesRepository");
jest.mock("../../../../services/drones/helpers", () => ({
  clampInt: jest.fn((v, def, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) return def;
    return Math.min(n, max);
  }),
  sanitizeText: jest.fn((v) => v || ""),
  hasColumn: jest.fn().mockResolvedValue(true),
}));

const dronesRepo = require("../../../../repositories/dronesRepository");
const { hasColumn } = require("../../../../services/drones/helpers");
const service = require("../../../../services/drones/galleryService");

beforeEach(() => {
  jest.clearAllMocks();
  hasColumn.mockResolvedValue(true);
});

describe("drones/galleryService", () => {
  describe("listGalleryPublic", () => {
    test("returns paginated gallery", async () => {
      dronesRepo.countGallery.mockResolvedValue(2);
      dronesRepo.listGallery.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.listGalleryPublic({ page: 1, limit: 12 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test("filters by model_key when column exists", async () => {
      dronesRepo.countGallery.mockResolvedValue(0);
      dronesRepo.listGallery.mockResolvedValue([]);

      await service.listGalleryPublic({ model_key: "agras" });

      expect(dronesRepo.countGallery).toHaveBeenCalledWith(
        expect.stringContaining("model_key"),
        ["agras"]
      );
    });
  });

  describe("listGalleryAdmin", () => {
    test("returns all items", async () => {
      dronesRepo.countGallery.mockResolvedValue(1);
      dronesRepo.listGallery.mockResolvedValue([{ id: 1 }]);

      const result = await service.listGalleryAdmin({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
    });
  });

  describe("createGalleryItem", () => {
    test("inserts item with all columns", async () => {
      dronesRepo.insertGalleryItem.mockResolvedValue(42);

      const id = await service.createGalleryItem({
        model_key: "agras",
        media_type: "IMAGE",
        media_path: "/uploads/drones/a.jpg",
        title: "Photo",
        sort_order: 1,
        is_active: 1,
      });

      expect(id).toBe(42);
      expect(dronesRepo.insertGalleryItem).toHaveBeenCalled();
    });

    test("throws on empty media_path", async () => {
      await expect(
        service.createGalleryItem({ media_type: "IMAGE", media_path: "" })
      ).rejects.toThrow("media_path obrigatório");
    });

    test("normalizes VIDEO media_type", async () => {
      dronesRepo.insertGalleryItem.mockResolvedValue(1);

      await service.createGalleryItem({
        media_type: "video",
        media_path: "/uploads/v.mp4",
      });

      const vals = dronesRepo.insertGalleryItem.mock.calls[0][1];
      expect(vals).toContain("VIDEO");
    });
  });

  describe("updateGalleryItem", () => {
    test("builds SET clause from payload", async () => {
      dronesRepo.updateGalleryItem.mockResolvedValue(1);

      const result = await service.updateGalleryItem(5, {
        title: "New Title",
        sort_order: 2,
        is_active: 0,
      });

      expect(result).toBe(1);
      expect(dronesRepo.updateGalleryItem).toHaveBeenCalledWith(5, expect.any(Array), expect.any(Array));
    });

    test("returns 0 when no fields", async () => {
      const result = await service.updateGalleryItem(5, {});
      expect(result).toBe(0);
      expect(dronesRepo.updateGalleryItem).not.toHaveBeenCalled();
    });

    test("throws on invalid id", async () => {
      await expect(service.updateGalleryItem(0, { title: "X" })).rejects.toThrow("id inválido");
    });
  });

  describe("deleteGalleryItem", () => {
    test("deletes item", async () => {
      dronesRepo.deleteGalleryItem.mockResolvedValue(1);
      const result = await service.deleteGalleryItem(5);
      expect(result).toBe(1);
    });

    test("throws on invalid id", async () => {
      await expect(service.deleteGalleryItem(0)).rejects.toThrow("id inválido");
    });
  });

  describe("getGalleryItemsByIds", () => {
    test("returns items for valid ids", async () => {
      dronesRepo.findGalleryItemsByIds.mockResolvedValue([{ id: 1 }]);
      const result = await service.getGalleryItemsByIds([1, 2]);
      expect(result).toHaveLength(1);
    });

    test("returns empty for no ids", async () => {
      const result = await service.getGalleryItemsByIds([]);
      expect(result).toEqual([]);
    });

    test("filters invalid ids", async () => {
      dronesRepo.findGalleryItemsByIds.mockResolvedValue([]);
      await service.getGalleryItemsByIds([0, -1, "abc"]);
      expect(dronesRepo.findGalleryItemsByIds).not.toHaveBeenCalled();
    });
  });
});
