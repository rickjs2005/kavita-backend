"use strict";

jest.mock("../../../../repositories/dronesRepository");
jest.mock("../../../../services/drones/helpers", () => ({
  clampInt: jest.fn((v, def, min, max) => Math.min(Math.max(Number(v) || def, min), max)),
  sanitizeText: jest.fn((v) => v || ""),
  hasColumn: jest.fn().mockResolvedValue(true),
}));

const dronesRepo = require("../../../../repositories/dronesRepository");
const { hasColumn } = require("../../../../services/drones/helpers");
const commentsService = require("../../../../services/drones/commentsService");

beforeEach(() => jest.clearAllMocks());

describe("drones/commentsService", () => {
  describe("listApprovedComments", () => {
    test("returns paginated comments with media", async () => {
      dronesRepo.countComments.mockResolvedValue(1);
      dronesRepo.listCommentRows.mockResolvedValue([
        { id: 1, model_key: "agras", display_name: "User", comment_text: "Nice", status: "APROVADO" },
      ]);
      dronesRepo.findCommentMediaByCommentIds.mockResolvedValue([
        { comment_id: 1, media_type: "IMAGE", media_path: "/img.jpg" },
      ]);

      const result = await commentsService.listApprovedComments({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].media).toHaveLength(1);
      expect(result.totalPages).toBe(1);
    });

    test("filters by model_key when hasColumn", async () => {
      dronesRepo.countComments.mockResolvedValue(0);
      dronesRepo.listCommentRows.mockResolvedValue([]);

      await commentsService.listApprovedComments({ model_key: "agras" });

      expect(dronesRepo.countComments).toHaveBeenCalledWith(
        expect.stringContaining("model_key"),
        expect.arrayContaining(["agras"])
      );
    });

    test("skips model_key filter when column not supported", async () => {
      hasColumn.mockResolvedValue(false);
      dronesRepo.countComments.mockResolvedValue(0);
      dronesRepo.listCommentRows.mockResolvedValue([]);

      await commentsService.listApprovedComments({ model_key: "agras" });

      expect(dronesRepo.countComments).toHaveBeenCalledWith(
        expect.not.stringContaining("model_key"),
        []
      );
    });
  });

});
