/**
 * test/unit/services/corretoraReviewsService.unit.test.js
 *
 * Cobre moderateReview — estados pending/approved/rejected e
 * garantia de que UPDATE roda dentro da transação.
 */

describe("services/corretoraReviewsService - moderateReview()", () => {
  const reviewsRepoPath = require.resolve(
    "../../../repositories/corretoraReviewsRepository",
  );
  const publicRepoPath = require.resolve(
    "../../../repositories/corretorasPublicRepository",
  );
  const analyticsPath = require.resolve("../../../services/analyticsService");
  const withTxPath = require.resolve("../../../lib/withTransaction");

  let svc;
  let reviewsRepo;
  let connMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    connMock = { query: jest.fn() };

    jest.doMock(withTxPath, () => ({
      withTransaction: jest.fn(async (fn) => fn(connMock)),
    }));
    jest.doMock(reviewsRepoPath, () => ({
      findById: jest.fn(),
      moderate: jest.fn(),
      create: jest.fn(),
    }));
    jest.doMock(publicRepoPath, () => ({
      findBySlug: jest.fn(),
    }));
    jest.doMock(analyticsPath, () => ({
      track: jest.fn(),
    }));

    reviewsRepo = require(reviewsRepoPath);
    svc = require("../../../services/corretoraReviewsService");
  });

  it("404 se review não existe", async () => {
    reviewsRepo.findById.mockResolvedValue(null);
    await expect(
      svc.moderateReview({ id: 1, action: "approve", reviewed_by: 9 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409 se já moderada", async () => {
    reviewsRepo.findById.mockResolvedValue({
      id: 1,
      status: "approved",
      corretora_id: 10,
    });
    await expect(
      svc.moderateReview({ id: 1, action: "approve", reviewed_by: 9 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("aprova — passa status approved e reviewed_by, usa conn tx", async () => {
    reviewsRepo.findById.mockResolvedValue({
      id: 1,
      status: "pending",
      corretora_id: 10,
      rating: 5,
    });
    reviewsRepo.moderate.mockResolvedValue(1);

    await svc.moderateReview({ id: 1, action: "approve", reviewed_by: 9 });

    expect(reviewsRepo.moderate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        status: "approved",
        reviewed_by: 9,
        rejection_reason: null,
      }),
      connMock,
    );
  });

  it("rejeita — inclui motivo", async () => {
    reviewsRepo.findById.mockResolvedValue({
      id: 1,
      status: "pending",
      corretora_id: 10,
      rating: 2,
    });
    reviewsRepo.moderate.mockResolvedValue(1);

    await svc.moderateReview({
      id: 1,
      action: "reject",
      reviewed_by: 9,
      rejection_reason: "ofensivo",
    });

    expect(reviewsRepo.moderate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        rejection_reason: "ofensivo",
      }),
      connMock,
    );
  });

  it("400 se UPDATE afetou 0 linhas (race)", async () => {
    reviewsRepo.findById.mockResolvedValue({
      id: 1,
      status: "pending",
      corretora_id: 10,
    });
    reviewsRepo.moderate.mockResolvedValue(0);

    await expect(
      svc.moderateReview({ id: 1, action: "approve", reviewed_by: 9 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
