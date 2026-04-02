"use strict";

jest.mock("../../../lib/withTransaction", () => ({
  withTransaction: jest.fn(async (fn) => fn({})),
}));
jest.mock("../../../repositories/productAdminRepository");
jest.mock("../../../services/mediaService", () => ({
  persistMedia: jest.fn().mockResolvedValue([]),
  enqueueOrphanCleanup: jest.fn(),
  removeMedia: jest.fn().mockResolvedValue(),
  toPublicPath: jest.fn((f) => `/uploads/${f}`),
  upload: {},
}));
jest.mock("../../../lib", () => ({
  logger: { error: jest.fn() },
}));

const repo = require("../../../repositories/productAdminRepository");
const mediaService = require("../../../services/mediaService");
const service = require("../../../services/produtosAdminService");

beforeEach(() => jest.clearAllMocks());

const validBody = {
  name: "Produto A",
  description: "Desc",
  price: "29.90",
  quantity: "10",
  category_id: "1",
  shippingFree: false,
};

describe("produtosAdminService", () => {
  describe("listProducts", () => {
    test("returns rows with images", async () => {
      repo.findAll.mockResolvedValue([{ id: 1 }]);
      repo.attachImages.mockResolvedValue([{ id: 1, images: [] }]);

      const result = await service.listProducts();

      expect(result).toHaveLength(1);
    });
  });

  describe("getProduct", () => {
    test("returns product with images", async () => {
      repo.findById.mockResolvedValue({ id: 1, name: "P" });
      repo.attachImages.mockResolvedValue([{ id: 1, name: "P", images: [] }]);

      const result = await service.getProduct(1);
      expect(result.id).toBe(1);
    });

    test("throws NOT_FOUND when not found", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getProduct(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("createProduct", () => {
    test("creates product without files", async () => {
      repo.insert.mockResolvedValue(42);
      const result = await service.createProduct(validBody, []);
      expect(result).toBe(42);
      expect(repo.insert).toHaveBeenCalled();
    });

    test("creates product with files — persists media", async () => {
      repo.insert.mockResolvedValue(42);
      mediaService.persistMedia.mockResolvedValue([{ path: "/uploads/products/a.jpg" }]);
      repo.insertImages.mockResolvedValue();
      repo.setMainImage.mockResolvedValue();

      const files = [{ filename: "a.jpg" }];
      const result = await service.createProduct(validBody, files);

      expect(result).toBe(42);
      expect(repo.insertImages).toHaveBeenCalledWith({}, 42, ["/uploads/products/a.jpg"]);
      expect(repo.setMainImage).toHaveBeenCalledWith({}, 42, "/uploads/products/a.jpg");
    });

    test("validation — empty name throws", async () => {
      await expect(service.createProduct({ ...validBody, name: "" }, [])).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    test("validation — price 0 throws", async () => {
      await expect(service.createProduct({ ...validBody, price: "0" }, [])).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    test("validation — negative quantity throws", async () => {
      await expect(service.createProduct({ ...validBody, quantity: "-1" }, [])).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    test("validation — category_id 0 throws", async () => {
      await expect(service.createProduct({ ...validBody, category_id: "0" }, [])).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });
  });

  describe("deleteProduct", () => {
    test("deletes product and cleans up media", async () => {
      repo.findImagesByProductId.mockResolvedValue([{ path: "/uploads/a.jpg" }]);
      repo.remove.mockResolvedValue(1);

      await service.deleteProduct(1);

      expect(repo.remove).toHaveBeenCalledWith({}, 1);
      expect(mediaService.removeMedia).toHaveBeenCalled();
    });

    test("throws NOT_FOUND", async () => {
      repo.findImagesByProductId.mockResolvedValue([]);
      repo.remove.mockResolvedValue(0);

      await expect(service.deleteProduct(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
