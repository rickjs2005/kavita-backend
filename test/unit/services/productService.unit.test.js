"use strict";

jest.mock("../../../repositories/productPublicRepository");

const productRepo = require("../../../repositories/productPublicRepository");
const service = require("../../../services/productService");

beforeEach(() => jest.clearAllMocks());

describe("productService", () => {
  describe("listProducts", () => {
    test("returns paginated items with images (category=all)", async () => {
      productRepo.findProducts.mockResolvedValue({
        rows: [{ id: 1, name: "P1" }],
        total: 1,
      });
      productRepo.findProductImages.mockResolvedValue([
        { product_id: 1, image_url: "/img/a.jpg" },
      ]);

      const result = await service.listProducts({ category: "all" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].images).toEqual(["/img/a.jpg"]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    test("resolves category slug to ID", async () => {
      productRepo.findCategoryByName.mockResolvedValue({ id: 5 });
      productRepo.findProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.listProducts({ category: "pragas-e-insetos" });

      expect(productRepo.findCategoryByName).toHaveBeenCalledWith("pragas e insetos");
      expect(productRepo.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 5 })
      );
    });

    test("numeric category string → direct ID", async () => {
      productRepo.findProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.listProducts({ category: "3" });

      expect(productRepo.findCategoryByName).not.toHaveBeenCalled();
      expect(productRepo.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 3 })
      );
    });

    test("throws NOT_FOUND when category slug not found", async () => {
      productRepo.findCategoryByName.mockResolvedValue(null);

      await expect(service.listProducts({ category: "inexistente" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("passes search term when provided", async () => {
      productRepo.findProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.listProducts({ search: "fert" });

      expect(productRepo.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "fert" })
      );
    });
  });

  describe("searchProducts", () => {
    test("returns paginated results", async () => {
      productRepo.searchProducts.mockResolvedValue({
        rows: [{ id: 1 }],
        total: 1,
      });
      productRepo.findProductImages.mockResolvedValue([]);

      const result = await service.searchProducts({ q: "drone" });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    test("parses minPrice and maxPrice", async () => {
      productRepo.searchProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.searchProducts({ minPrice: "10", maxPrice: "100" });

      expect(productRepo.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ minPrice: 10, maxPrice: 100 })
      );
    });

    test("throws VALIDATION_ERROR for invalid minPrice", async () => {
      await expect(service.searchProducts({ minPrice: "abc" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    test("throws VALIDATION_ERROR for invalid maxPrice", async () => {
      await expect(service.searchProducts({ maxPrice: "xyz" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    test("parses categories CSV", async () => {
      productRepo.searchProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.searchProducts({ categories: "1,2,3" });

      expect(productRepo.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ catIds: [1, 2, 3] })
      );
    });

    test("handles promo flag", async () => {
      productRepo.searchProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.searchProducts({ promo: "true" });

      expect(productRepo.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ promo: true })
      );
    });

    test("fallback to category_id when categories not set", async () => {
      productRepo.searchProducts.mockResolvedValue({ rows: [], total: 0 });

      await service.searchProducts({ category_id: "7" });

      expect(productRepo.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ catIds: [7] })
      );
    });
  });
});
