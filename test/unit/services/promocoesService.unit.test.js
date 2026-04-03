"use strict";

jest.mock("../../../repositories/promocoesRepository");

const repo = require("../../../repositories/promocoesRepository");
const service = require("../../../services/promocoesService");

beforeEach(() => jest.clearAllMocks());

describe("promocoesService", () => {
  test("listPromocoes delegates to repo", async () => {
    repo.findActivePromocoes.mockResolvedValue([{ id: 1 }]);
    const result = await service.listPromocoes();
    expect(result).toEqual([{ id: 1 }]);
  });

  test("getPromocaoByProductId returns promo when found", async () => {
    repo.findActivePromocaoByProductId.mockResolvedValue({ id: 1, product_id: 5 });
    const result = await service.getPromocaoByProductId(5);
    expect(result.product_id).toBe(5);
  });

  test("getPromocaoByProductId throws NOT_FOUND when no promo", async () => {
    repo.findActivePromocaoByProductId.mockResolvedValue(null);
    await expect(service.getPromocaoByProductId(999)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
