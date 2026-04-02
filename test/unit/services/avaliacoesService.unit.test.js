"use strict";

jest.mock("../../../lib/withTransaction", () => ({
  withTransaction: jest.fn(async (fn) => fn({})),
}));
jest.mock("../../../repositories/avaliacoesRepository");

const repo = require("../../../repositories/avaliacoesRepository");
const { withTransaction } = require("../../../lib/withTransaction");
const service = require("../../../services/avaliacoesService");

beforeEach(() => jest.clearAllMocks());

describe("avaliacoesService", () => {
  describe("createReview", () => {
    test("calls createReview + recalcRating inside transaction", async () => {
      repo.createReview.mockResolvedValue();
      repo.recalcRating.mockResolvedValue();

      await service.createReview(1, 7, 5, "Great");

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(repo.createReview).toHaveBeenCalledWith({}, 1, 7, 5, "Great");
      expect(repo.recalcRating).toHaveBeenCalledWith({}, 1);
    });

    test("propagates errors", async () => {
      repo.createReview.mockRejectedValue(new Error("db"));

      await expect(service.createReview(1, 7, 5, null)).rejects.toThrow("db");
    });
  });
});
